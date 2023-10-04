import "dotenv/config";
import express from "express";
import Redis from "ioredis";
import * as crypto from "crypto";
import { isValidDate } from "./utils/dateValidator";

const { Validator } = require("jsonschema");

const generateEtag = (content: string): string => {
  return crypto.createHash("md5").update(content).digest("hex");
};
const main = async () => {
  const app = express();
  const redisClient = new Redis();
  app.use(express.json());
  app.listen(process.env.PORT, () => {
    console.log("using server, ", process.env.PORT);
  });
  /// Schema
  app.post("/schema", async (req, res) => {
    console.log("Adding Json Schema to the redis client");
    const schema: JSON = req.body as JSON;
    const data = await redisClient.get("schema");
    if (data) {
      res.status(409).send("Schema Already Exists");
    } else {
      await redisClient.set(
        "schema",
        JSON.stringify(schema),
        (err, _result) => {
          if (err) {
            res.status(500).send("Error in adding Schema");
            console.log(err);
          } else {
            res.status(200).send("The Schema is Added");
          }
        },
      );
    }
  });
  app.delete("/schema", async (_req, res) => {
    console.log("Deleting Json Schema from the redis client");
    const exists = await redisClient.exists("schema");
    if (!exists) return res.status(500).send("No such value to delete");

    return await redisClient.del("schema", (err, _result) => {
      if (err) return res.status(500).send("Error in deleting Schema");
      else {
        return res.status(200).send("Schema is deleted");
      }
    });
  });
  // plans
  app.post("/plan", async (req, res) => {
    console.log("Adding a plan to the redis client");
    const schema = await redisClient.get("schema");

    if (!schema)
      return res.status(404).send("No Schema Found! Add a Schema first");
    const planBody = req.body;
    const objectID: string =
      planBody.objectId !== undefined ? planBody.objectId : null;

    if (!objectID)
      return res
        .status(400)
        .send("Invalid Object! Does not match the Schema provided");
    /// Now check if the Object Exists already
    const obj = await redisClient.exists(objectID);

    if (obj) {
      const objectInPlan = await redisClient.hgetall(objectID);
      return res
        .status(409)
        .send("Object Already Exists!!!" + JSON.stringify(objectInPlan));
    }

    /// Validate object
    const validator = new Validator();
    const result = validator.validate(planBody, JSON.parse(schema as string));
    if (!result.valid)
      return res
        .status(400)
        .send("Invalid Object! Does not match the Schema provided");

    ///check if the dates are valid or not
    const creationDateValid = isValidDate(planBody.creationDate);
    if (!creationDateValid) {
      return res
        .status(400)
        .send(
          "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format",
        );
    }

    const eTag = generateEtag(JSON.stringify(planBody));
    await redisClient.hset(
      objectID,
      "content",
      JSON.stringify(planBody),
      "Etag",
      eTag,
      (err) => {
        if (err) res.status(500).send("Error in saving value");
      },
    );
    return res.status(201).send("Object Successfully Saved");
  });
  app.get("/plan/:id", async (req, res) => {
    const key = req.params.id;
    const obj = await redisClient.hgetall(key);

    if (!obj || !obj.content) {
      return res.status(404).send("No such Object Exists");
    }
    const clientEtag = req.header("If-None-Match");
    if (clientEtag && clientEtag === obj.Etag) {
      return res.status(304).send();
    }

    return res.status(200).send("Obj" + JSON.stringify(obj));
  });
  app.delete("/plan/:id", async (req, res) => {
    const key = req.params.id;
    const obj = await redisClient.hgetall(key);

    if (!obj || !obj.content) {
      return res.status(404).send("No such Object Exists");
    }
    return await redisClient.del(key, (err, result) => {
      if (err) {
        return res.status(500).send("Error deleting plan.");
      }

      if (result === 1) {
        return res.status(200).send("Plan successfully deleted.");
      } else {
        return res.status(404).send("Plan not found.");
      }
    });
  });
};

main().catch((e) => {
  console.log("Error -", e);
});
