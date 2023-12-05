import "dotenv/config";
import express from "express";
import Redis from "ioredis";
import {
  deletePlan,
  deleteSchema,
  getPlan,
  getToken,
  patchPlan,
  postPlan,
  postSchema,
  putPlan,
} from "./utils/apiLogicForCRUD";
import { getMappingFromEs } from "./utils/apiLogicForSearch";
import { fetchAllDocuments } from "./utils/elasticSearch";
import { verifyHeaderToken } from "./utils/jwtAuth";
import { receiveMessage, saveESItems } from "./utils/rabbitMq";

const fs = require("fs");
const { Client } = require("@elastic/elasticsearch");

const main = async () => {
  // const rabbitMq = await rabbitMqConnection();
  // console.log(rabbitMq.connection)
  // const runcommand = `export NODE_EXTRA_CA_CERTS="/Users/paurushbatish/Desktop/ADVBIGDATA/elasticsearch-8.11.1/config/certs/http_ca.crt"`;
  // const runcommand2 = `export NODE_EXTRA_CA_CERTS="/Users/paurushbatish/Desktop/ESANDKIB/elasticsearch-8.10.1/config/certs/http_ca.crt"`;
  const esClient = new Client({
    node: process.env.ES_NODE,
    auth: {
      username: process.env.ES_USERNAME || "",
      password: process.env.ES_PASSWORD || "",
    },
    ssl: {
      ca: fs.readFileSync("cert/http_ca.crt"),
      rejectUnauthorized: true, // Set to false only if you want to bypass SSL certificate validation (not recommended for production)
    },
  });
  await receiveMessage("requestQueue", esClient, saveESItems);
  // await getMapping(esClient);
  //  await createElasticsearchMappings(esClient);
  //  await esClient.indices.delete({ index: 'plans' });
  //  deleteAllDocuments('plans', esClient)
  //  const val =  await fetchAllDocuments('plans', esClient)
  // console.log(val.hits)

  await esClient.info();
  const app = express();
  const redisClient = new Redis();
  app.use(express.json());
  app.listen(process.env.PORT, () => {
    console.log("using server, ", process.env.PORT);
  });

  ///JWT AUTH
  app.get("/getToken", async (_req, res) => {
    const result = await getToken();
    if (result.error) {
      return res.status(result.error.status).send(result.error.message);
    }
    return res.send(result.response);
  });

  /// Schema
  app.post("/schema", verifyHeaderToken, async (req, res) => {
    const response = await postSchema(req.body as JSON, redisClient);
    return res.status(response.response.status).send(response.response.message);
  });

  app.delete("/schema", verifyHeaderToken, async (_req, res) => {
    const response = await deleteSchema("schema", redisClient);
    return res.status(response.response.status).send(response.response.message);
  });

  // plans
  app.post("/plan", verifyHeaderToken, async (req, res) => {
    console.log("Adding a plan to the redis client");
    const planBody = req.body;
    const response = await postPlan(
      "plan_" + planBody.objectId,
      redisClient,
      esClient,
      planBody,
    );
    if (response!.response?.eTag) {
      res.setHeader("ETag", response!.response.eTag);
    }
    return res.status(response!.response.status).send(response!.response.body);
  });
  app.get("/plan/:id", verifyHeaderToken, async (req, res) => {
    const key = "plan_" + req.params.id;
    const clientEtag = req.header("If-None-Match");
    const response = await getPlan(key, redisClient, esClient, clientEtag);
    if (response.response.eTag) {
      res.setHeader("ETag", response.response.eTag);
    }
    return res.status(response.response.status).send(response.response.body);
  });
  app.delete("/plan/:id", verifyHeaderToken, async (req, res) => {
    const key = "plan_" + req.params.id;
    const response = await deletePlan(key, redisClient, esClient);
    return res.status(response.response.status).send(response.response.message);
  });
  app.put("/plan/:id", verifyHeaderToken, async (req, res) => {
    const key = "plan_" + req.params.id;
    const planBody = req.body;
    const clientEtag = req.header("If-Match");
    const response = await putPlan(
      key,
      redisClient,
      esClient,
      planBody,
      clientEtag,
    );
    if (response.response.eTag) {
      res.setHeader("ETag", response.response.eTag);
    }
    return res.status(response.response.status).send(response.response.body);
  });
  app.patch("/plan/:id", verifyHeaderToken, async (req, res) => {
    const key = "plan_" + req.params.id;
    const planBody = req.body;
    const clientEtag = req.header("If-Match");
    const response = await patchPlan(
      key,
      redisClient,
      esClient,
      planBody,
      clientEtag,
    );
    if (response.response.eTag) {
      res.setHeader("ETag", response.response.eTag);
    }
    return res.status(response.response.status).send(response.response.body);
  });

  // search

  app.get("/allResults", verifyHeaderToken, async (req, res) => {
    try {
      const index = req.params;
      const documents = await fetchAllDocuments((index as any).index, esClient);
      res.json(documents.hits.hits);
    } catch (error) {
      res.status(500).send("Error fetching documents");
    }
  });

  app.get("/getMapping", verifyHeaderToken, async (_req, res) => {
    const response = await getMappingFromEs(esClient);
    return res.status(response.response.status).send(response.response.body);
  });
};

main().catch((e) => {
  console.log("Error -", e);
});
