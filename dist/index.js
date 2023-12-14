"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const ioredis_1 = __importDefault(require("ioredis"));
const apiLogicForCRUD_1 = require("./utils/apiLogicForCRUD");
const apiLogicForSearch_1 = require("./utils/apiLogicForSearch");
const elasticSearch_1 = require("./utils/elasticSearch");
const jwtAuth_1 = require("./utils/jwtAuth");
const rabbitMq_1 = require("./utils/rabbitMq");
const fs = require("fs");
const { Client } = require("@elastic/elasticsearch");
const main = async () => {
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
        const result = await (0, apiLogicForCRUD_1.getToken)();
        if (result.error) {
            return res.status(result.error.status).send(result.error.message);
        }
        return res.send(result.response);
    });
    app.post("/schema", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const response = await (0, apiLogicForCRUD_1.postSchema)(req.body, redisClient);
        return res.status(response.response.status).send(response.response.message);
    });
    app.delete("/schema", jwtAuth_1.verifyHeaderToken, async (_req, res) => {
        const response = await (0, apiLogicForCRUD_1.deleteSchema)("schema", redisClient);
        return res.status(response.response.status).send(response.response.message);
    });
    app.post("/plan", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        var _a;
        console.log("Adding a plan to the redis client");
        const planBody = req.body;
        const response = await (0, apiLogicForCRUD_1.postPlan)("plan_" + planBody.objectId, redisClient, planBody);
        if ((_a = response.response) === null || _a === void 0 ? void 0 : _a.eTag) {
            res.setHeader("ETag", response.response.eTag);
        }
        return res.status(response.response.status).send(response.response.body);
    });
    app.get("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = "plan_" + req.params.id;
        const clientEtag = req.header("If-None-Match");
        const response = await (0, apiLogicForCRUD_1.getPlan)(key, redisClient, esClient, clientEtag);
        if (response.response.eTag) {
            res.setHeader("ETag", response.response.eTag);
        }
        return res.status(response.response.status).send(response.response.body);
    });
    app.delete("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = "plan_" + req.params.id;
        const response = await (0, apiLogicForCRUD_1.deletePlan)(key, redisClient);
        return res.status(response.response.status).send(response.response.message);
    });
    app.put("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = "plan_" + req.params.id;
        const planBody = req.body;
        const clientEtag = req.header("If-Match");
        const response = await (0, apiLogicForCRUD_1.putPlan)(key, redisClient, esClient, planBody, clientEtag);
        if (response.response.eTag) {
            res.setHeader("ETag", response.response.eTag);
        }
        return res.status(response.response.status).send(response.response.body);
    });
    app.patch("/plan/:id", jwtAuth_1.verifyHeaderToken, async (req, res) => {
        const key = "plan_" + req.params.id;
        const planBody = req.body;
        const clientEtag = req.header("If-Match");
        const response = await (0, apiLogicForCRUD_1.patchPlan)(key, redisClient, esClient, planBody, clientEtag);
        if (response.response.eTag) {
            res.setHeader("ETag", response.response.eTag);
        }
        return res.status(response.response.status).send(response.response.body);
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
    app.get("/getMapping", jwtAuth_1.verifyHeaderToken, async (_req, res) => {
        const response = await (0, apiLogicForSearch_1.getMappingFromEs)(esClient);
        return res.status(response.response.status).send(response.response.body);
    });
};
main().catch((e) => {
    console.log("Error -", e);
});
//# sourceMappingURL=index.js.map