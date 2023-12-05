"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const ioredis_1 = __importDefault(require("ioredis"));
const dateValidator_1 = require("./utils/dateValidator");
const elasticSearch_1 = require("./utils/elasticSearch");
const jwtAuth_1 = require("./utils/jwtAuth");
const modifyObject_1 = require("./utils/modifyObject");
const rabbitMq_1 = require("./utils/rabbitMq");
const fs = require("fs");
const { Client } = require("@elastic/elasticsearch");
const { Validator } = require("jsonschema");
const checkIfObjectExistsNow = async (fetchSavedObject, esClient, planBody, res, statusCode) => {
    const result = await (0, elasticSearch_1.ObjectExists)(fetchSavedObject.objectType + "_" + fetchSavedObject.objectId, esClient, fetchSavedObject);
    console.log("Checking if object exists...");
    if (result) {
        console.log("Object found:", result);
        console.log("Continuing with relationship generation...");
        await (0, elasticSearch_1.generateRelationshipsStart)(planBody, esClient);
        return res.status(statusCode).send("Object Successfully Saved");
    }
    else {
        console.log("Object not found, retrying...");
        setTimeout(() => checkIfObjectExistsNow(fetchSavedObject, esClient, planBody, res, statusCode), 200);
    }
};
const main = async () => {
    const runcommand = `export NODE_EXTRA_CA_CERTS="/Users/paurushbatish/Desktop/ADVBIGDATA/elasticsearch-8.11.1/config/certs/http_ca.crt"`;
    const runcommand2 = `export NODE_EXTRA_CA_CERTS="/Users/paurushbatish/Desktop/ESANDKIB/elasticsearch-8.10.1/config/certs/http_ca.crt"`;
    const esClient = new Client({
        node: process.env.ES_NODE,
        auth: {
            username: process.env.ES_USERNAME || "",
            password: process.env.ES_PASSWORD || "",
        },
        ssl: {
            ca: fs.readFileSync("cert/http_ca.crt"),
            rejectUnauthorized: true,
        },
    });
    await (0, rabbitMq_1.receiveMessage)("requestQueue", esClient, rabbitMq_1.saveESItems);
    await esClient.info();
    const app = (0, express_1.default)();
    const redisClient = new ioredis_1.default();
    app.use(express_1.default.json());
    app.listen(process.env.PORT, () => {
        console.log("using server, ", process.env.PORT);
    });
    app.get("/getToken", async (_req, res) => {
        try {
            const response = await (0, jwtAuth_1.fetchAccessToken)();
            const { access_token, expires_in, token_type } = response;
            res.send({
                access_token,
                expires_in,
                token_type,
            });
        }
        catch (e) {
            console.log(e);
            res.status(e.response.status).send(e);
        }
    });
    app.post("/schema", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        console.log("Adding Json Schema to the redis client");
        const schema = req.body;
        const data = await redisClient.get("schema");
        if (data) {
            res.status(409).send("Schema Already Exists");
        }
        else {
            await redisClient.set("schema", JSON.stringify(schema), (err, _result) => {
                if (err) {
                    res.status(500).send("Error in adding Schema");
                    console.log(err);
                }
                else {
                    res.status(200).send("The Schema is Added");
                }
            });
        }
    });
    app.delete("/schema", jwtAuth_1.verifyHeaderToken, async (_req, res) => {
        console.log("Deleting Json Schema from the redis client");
        const exists = await redisClient.exists("schema");
        if (!exists)
            return res.status(500).send("No such value to delete");
        return await redisClient.del("schema", (err, _result) => {
            if (err)
                return res.status(500).send("Error in deleting Schema");
            else {
                return res.status(200).send("Schema is deleted");
            }
        });
    });
    app.post("/plan", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        console.log("Adding a plan to the redis client");
        const schema = await redisClient.get("schema");
        if (!schema)
            return res.status(404).send("No Schema Found! Add a Schema first");
        const planBody = req.body;
        const objectID = planBody.objectId !== undefined ? planBody.objectId : null;
        if (!objectID)
            return res
                .status(400)
                .send("Invalid Object! Does not match the Schema provided");
        const obj = await redisClient.exists(planBody.objectType + "_" + objectID);
        if (obj) {
            const objectInPlan = await redisClient.get(planBody.objectType + "_" + objectID);
            return res.status(409).send("Object Already Exists!!!" + objectInPlan);
        }
        const validator = new Validator();
        const result = validator.validate(planBody, JSON.parse(schema));
        if (!result.valid)
            return res
                .status(400)
                .send("Invalid Object! Does not match the Schema provided");
        const creationDateValid = (0, dateValidator_1.isValidDate)(planBody.creationDate);
        if (!creationDateValid) {
            return res
                .status(400)
                .send("Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format");
        }
        try {
            const fetchSavedObject = await (0, elasticSearch_1.saveObjectRecursive)(planBody, redisClient);
            const generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(planBody));
            res.setHeader("ETag", generatedEtag);
            await (0, rabbitMq_1.sendESRequest)(fetchSavedObject, "POST");
            await checkIfObjectExistsNow(fetchSavedObject, esClient, planBody, res, 201);
        }
        catch (e) {
            console.log(e);
            res.status(500).send("Error in saving object");
        }
    });
    app.get("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = req.params.id;
        const obj = await redisClient.get(("plan_" + key));
        if (!obj) {
            return res.status(404).send("No such Object Exists");
        }
        const clientEtag = req.header("If-None-Match");
        const mainObject = JSON.parse(obj);
        const reconstructedMainObject = await (0, elasticSearch_1.reconstructObject)(mainObject, redisClient, esClient);
        const generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedMainObject));
        if (clientEtag && clientEtag === generatedEtag) {
            return res.status(304).send();
        }
        res.setHeader("ETag", generatedEtag);
        return res.status(200).send(reconstructedMainObject);
    });
    app.delete("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = "plan_" + req.params.id;
        const obj = await redisClient.get(key);
        if (!obj) {
            return res.status(404).send("No such Object Exists");
        }
        try {
            await (0, elasticSearch_1.deleteObject)(key, redisClient, esClient).then((result) => {
                return res.status(200).send("Plan successfully deleted.");
            });
        }
        catch (e) {
            return res.status(500).send("Error deleting plan.");
        }
    });
    app.put("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const schema = await redisClient.get("schema");
            if (!schema)
                return res.status(404).send("No Schema Found! Add a Schema first");
            const key = req.params.id;
            const planBody = req.body;
            const obj = await redisClient.get("plan_" + key);
            if (!obj)
                return res.status(404).send("No such Object Exists");
            const reconstructedOldObject = await (0, elasticSearch_1.reconstructObject)(JSON.parse(obj), redisClient, esClient);
            const clientEtag = req.header("If-Match");
            let generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedOldObject));
            if (clientEtag && clientEtag !== generatedEtag) {
                return res.status(412).send("Precondition failed");
            }
            const validator = new Validator();
            const result = validator.validate(planBody, JSON.parse(schema));
            if (!result.valid)
                return res
                    .status(400)
                    .send("Invalid Object! Does not match the Schema provided");
            if (!(0, dateValidator_1.isValidDate)(planBody.creationDate)) {
                return res
                    .status(400)
                    .send("Invalid Date Object! Make sure it's in DD-MM-YYYY format");
            }
            try {
                const fetchSavedObject = await (0, elasticSearch_1.saveObjectRecursive)(planBody, redisClient);
                generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(planBody));
                res.setHeader("ETag", generatedEtag);
                await (0, rabbitMq_1.sendESRequest)(fetchSavedObject, "PUT");
                await checkIfObjectExistsNow(fetchSavedObject, esClient, planBody, res, 200);
            }
            catch (e) {
                res.status(500).send("Error in saving value");
            }
        }
        catch (error) {
            return res.status(500).send("Internal Server Error");
        }
    });
    app.patch("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const schema = await redisClient.get("schema");
            if (!schema)
                return res.status(404).send("No Schema Found! Add a Schema first");
            const key = req.params.id;
            const updatedBody = req.body;
            const obj = await redisClient.get("plan_" + key);
            if (!obj) {
                return res.status(404).send("No such object found");
            }
            const reconstructedOldObject = await (0, elasticSearch_1.reconstructObject)(JSON.parse(obj), redisClient, esClient);
            const updatedObject = (0, modifyObject_1.modifyObject)(reconstructedOldObject, updatedBody);
            if (updatedObject &&
                typeof updatedObject === "string" &&
                updatedObject === "Wrong Object Type") {
                return res
                    .status(400)
                    .send("Wrong Object Type Entered, Must be within the scope of the Schema");
            }
            const validator = new Validator();
            const result = validator.validate(updatedObject, JSON.parse(schema));
            if (!result.valid)
                return res
                    .status(400)
                    .send("Invalid Object! Does not match the Schema provided");
            if (!(0, dateValidator_1.isValidDate)(updatedObject.creationDate)) {
                return res
                    .status(400)
                    .send("Invalid Date Object! Make sure it's in DD-MM-YYYY format");
            }
            const clientEtag = req.header("If-Match");
            let generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedOldObject));
            if (clientEtag && clientEtag !== generatedEtag) {
                return res.status(412).send("Precondition failed");
            }
            try {
                const fetchSavedObject = await (0, elasticSearch_1.saveObjectRecursive)(updatedObject, redisClient);
                generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(updatedObject));
                res.setHeader("ETag", generatedEtag);
                await (0, rabbitMq_1.sendESRequest)(fetchSavedObject, "PATCH");
                await checkIfObjectExistsNow(fetchSavedObject, esClient, updatedObject, res, 200);
            }
            catch (e) {
                res.status(500).send("Error in saving value");
            }
        }
        catch (e) {
            return res.status(500).send("Internal Server Error");
        }
    });
    app.get("/search/plans", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const searchCriteria = req.query;
            console.log(searchCriteria);
            if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
                return res.status(400).send("Search criteria are required");
            }
            let query = {
                bool: {
                    must: [],
                },
            };
            for (const [field, value] of Object.entries(searchCriteria)) {
                query.bool.must.push({ match_phrase: { [field]: value } });
            }
            const searchResult = await esClient.search({
                index: "plans",
                body: {
                    query,
                },
            });
            console.log(query.bool.must);
            return res.status(200).json(searchResult.hits.hits);
        }
        catch (error) {
            console.error("Error during search", error);
            return res.status(500).send("Internal Server Error");
        }
    });
    app.get("/allResults", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const index = req.params;
            const documents = await (0, elasticSearch_1.fetchAllDocuments)(index.index, esClient);
            res.json(documents.hits.hits);
        }
        catch (error) {
            res.status(500).send("Error fetching documents");
        }
    });
    app.get("/allChildrenHavingCopayLessOrGreater", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const fields = req.query;
            let lessQ = false;
            if (fields.lt === "true") {
                console.log(fields);
                lessQ = true;
            }
            const query = lessQ
                ? {
                    query: {
                        has_child: {
                            type: "planCostShares",
                            query: {
                                range: {
                                    copay: {
                                        lt: fields.copay,
                                    },
                                },
                            },
                        },
                    },
                }
                : {
                    query: {
                        has_child: {
                            type: "planCostShares",
                            query: {
                                range: {
                                    copay: {
                                        gt: fields.copay,
                                    },
                                },
                            },
                        },
                    },
                };
            const body = await esClient.search({
                index: "plans",
                body: query,
            });
            const allPlans = [];
            body.hits.hits.forEach((element) => {
                allPlans.push(element._source);
            });
            const promises = allPlans.map((val) => {
                return (async () => {
                    return await (0, elasticSearch_1.reconstructObject)(val, redisClient, esClient);
                })();
            });
            const allPlansRestructured = await Promise.all(promises);
            return res.status(200).send(allPlansRestructured);
        }
        catch (error) {
            console.error("Error fetching documents:", error);
            res.status(500).send("Error fetching documents");
        }
    });
    app.get("/allParentsHaving", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const fields = req.query;
            const query = {
                query: {
                    has_child: {
                        type: fields.type,
                        query: {
                            bool: {
                                must: [],
                            },
                        },
                    },
                },
            };
            for (const [keys, vals] of Object.entries(fields)) {
                if (keys === "type") {
                    continue;
                }
                else {
                    query.query.has_child.query.bool.must.push({
                        match_phrase: { [keys]: vals },
                    });
                }
            }
            const body = await esClient.search({
                index: "plans",
                body: query,
            });
            const totalNoOfPlans = body.hits.total.value;
            const allPlans = [];
            body.hits.hits.forEach((element) => {
                allPlans.push(element._source);
            });
            const promises = allPlans.map((val) => {
                return (async () => {
                    return await (0, elasticSearch_1.reconstructObject)(val, redisClient, esClient);
                })();
            });
            const allPlansRestructured = await Promise.all(promises);
            return res.status(200).send(allPlansRestructured);
        }
        catch (error) {
            console.error("Error fetching documents:", error);
            res.status(500).send("Error fetching documents");
        }
    });
    app.get("/getMapping", jwtAuth_1.verifyHeaderToken, async (_req, res) => {
        try {
            const response = await (0, elasticSearch_1.getMapping)(esClient);
            res.status(200).send(response);
        }
        catch (e) {
            res.status(404).send("Not Found");
        }
    });
};
main().catch((e) => {
    console.log("Error -", e);
});
//# sourceMappingURL=index.js.map