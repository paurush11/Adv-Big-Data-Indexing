import "dotenv/config";
import express from "express";
import Redis from "ioredis";
import * as crypto from "crypto";

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
      await redisClient.set("schema", JSON.stringify(schema), (err, result) => {
        if (err) {
          res.status(500).send("Error in adding Schema");
          console.log(err);
        } else {
          res.status(200).send("The Schema is Added");
        }
      });
    }
  });

  app.delete("/schema", async (req, res) => {
    console.log("Deleting Json Schema from the redis client");
    const exists = await redisClient.exists("schema");
    if (!exists) return res.status(500).send("No such value to delete");

    await redisClient.del("schema", (err, result) => {
      if (err) return res.status(500).send("Error in deleting Schema");
      else {
        res.status(200).send("Schema is deleted");
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
    const objectID = planBody.objectId;
    /// Now check if the Object Exists already
    const obj = await redisClient.exists(objectID);
    if (obj)
      return res
        .status(409)
        .send("Object Already Exists!!!" + JSON.stringify(obj));
    /// Validate object
    const validator = new Validator();
    const result = validator.validate(planBody, JSON.parse(schema as string));
    if (!result.valid)
      return res
        .status(400)
        .send("Invalid Object! Does not match the Schema provided");

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
    res.status(201).send("Object Successfully Saved");
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

    res.status(200).send("Obj" + obj.content);
  });
  app.delete("/plan/:id", async (req, res) => {
    const key = req.params.id;
    const obj = await redisClient.hgetall(key);
    if (!obj || !obj.content) {
      return res.status(404).send("No such Object Exists");
    }
    const clientEtag = req.header("If-Match");
    if (clientEtag && clientEtag === obj.Etag) {
      await redisClient.del(key, (err, result) => {
        if (err) {
          return res.status(500).send("Error deleting plan.");
        }

        if (result === 1) {
          res.status(200).send("Plan successfully deleted.");
        } else {
          res.status(404).send("Plan not found.");
        }
      });
    } else
      return res
        .status(500)
        .send("You need an Etag to make sure the object is safe to delete");
  });
};

main().catch((e) => {
  console.log("Error -", e);
});

// post get and delete
// create a json schema
// validate it on post
// paylooad of post has to pass validation
/// store data in key value store
/// show that you can get and delete the data
// conditionasl read
