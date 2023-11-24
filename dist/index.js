"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = __importStar(require("crypto"));
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const ioredis_1 = __importDefault(require("ioredis"));
const dateValidator_1 = require("./utils/dateValidator");
const jwtAuth_1 = require("./utils/jwtAuth");
const modifyObject_1 = require("./utils/modifyObject");
const fs = require("fs");
const { Client } = require("@elastic/elasticsearch");
const { Validator } = require("jsonschema");
const generateEtag = (content) => {
    return crypto.createHash("md5").update(content).digest("hex");
};
const main = async () => {
    const runcommand = `export NODE_EXTRA_CA_CERTS="/Users/paurushbatish/Desktop/react/bigdataIndexingProject/cert/http_ca.crt"`;
    const esClient = new Client({
        node: "https://localhost:9200",
        auth: {
            username: "elastic",
            password: "rS-ArgUdo--zsSGZv+Vf",
        },
        ssl: {
            ca: fs.readFileSync("cert/http_ca.crt"),
            rejectUnauthorized: true,
        },
    });
    const resp = await esClient.info();
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
        const obj = await redisClient.exists(objectID);
        if (obj) {
            const objectInPlan = await redisClient.get(objectID);
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
        await redisClient.set(objectID, JSON.stringify(planBody), (err) => {
            if (err)
                res.status(500).send("Error in saving value");
        });
        const generatedEtag = generateEtag(JSON.stringify(planBody));
        res.setHeader("ETag", generatedEtag);
        await esClient.index({
            index: "plans",
            id: objectID,
            body: planBody,
        });
        return res.status(201).send("Object Successfully Saved");
    });
    app.get("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = req.params.id;
        const obj = await redisClient.get(key);
        if (!obj) {
            return res.status(404).send("No such Object Exists");
        }
        const clientEtag = req.header("If-None-Match");
        const generatedEtag = generateEtag(obj);
        if (clientEtag && clientEtag === generatedEtag) {
            return res.status(304).send();
        }
        res.setHeader("ETag", generatedEtag);
        return res.status(200).send(obj);
    });
    app.delete("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = req.params.id;
        const obj = await redisClient.get(key);
        if (!obj) {
            return res.status(404).send("No such Object Exists");
        }
        return await redisClient.del(key, async (err, result) => {
            if (err) {
                return res.status(500).send("Error deleting plan.");
            }
            if (result === 1) {
                await esClient.delete({
                    index: "plans",
                    id: key,
                });
                return res.status(200).send("Plan successfully deleted.");
            }
            else {
                return res.status(404).send("Plan not found.");
            }
        });
    });
    app.put("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        try {
            const schema = await redisClient.get("schema");
            if (!schema)
                return res.status(404).send("No Schema Found! Add a Schema first");
            const key = req.params.id;
            const planBody = req.body;
            const obj = await redisClient.get(key);
            if (!obj)
                return res.status(404).send("No such Object Exists");
            const clientEtag = req.header("If-Match");
            const generatedEtag = generateEtag(obj);
            if (!clientEtag || (clientEtag && clientEtag !== generatedEtag)) {
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
            await redisClient.set(key, JSON.stringify(planBody), (err) => {
                if (err)
                    return res.status(500).send("Error in saving value");
            });
            res.setHeader("ETag", generatedEtag);
            const statusCode = 200;
            await esClient.update({
                index: "plans",
                id: key,
                body: {
                    doc: planBody,
                },
            });
            return res.status(statusCode).send(planBody);
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
            const obj = await redisClient.get(key);
            if (!obj) {
                return res.status(404).send("No such object found");
            }
            const updatedObject = (0, modifyObject_1.modifyObject)(JSON.parse(obj), updatedBody);
            if (updatedObject &&
                typeof updatedObject === "string" &&
                updatedObject === "Wrong Object Type") {
                return res
                    .status(400)
                    .send("Wrong Object Type Entered, Must be within the scope of the Schema");
            }
            console.log(updatedObject);
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
            let generatedEtag = generateEtag(obj);
            if (!clientEtag || (clientEtag && clientEtag !== generatedEtag)) {
                return res.status(412).send("Precondition failed");
            }
            await redisClient.set(key, JSON.stringify(updatedObject), (err) => {
                if (err)
                    return res.status(500).send("Error in saving value");
            });
            generatedEtag = generateEtag(JSON.stringify(updatedObject));
            res.setHeader("ETag", generatedEtag);
            await esClient.update({
                index: "plans",
                id: key,
                body: {
                    doc: updatedObject,
                },
            });
            return res.status(200).send(updatedObject);
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
};
main().catch((e) => {
    console.log("Error -", e);
});
//# sourceMappingURL=index.js.map