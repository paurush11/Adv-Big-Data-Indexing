import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import Redis from "ioredis";
import * as crypto from "crypto";
import { isValidDate } from "./utils/dateValidator";
import { modifyObject } from "./utils/modifyObject";
import { mainObject } from "./utils/types";
import { fetchAccessToken, verifyHeaderToken } from "./utils/jwtAuth";

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
  ///JWT AUTH

  app.get("/getToken", async (req, res) => {
    try{
      const response = await fetchAccessToken();
      const { access_token, expires_in, token_type } = response
      res.send({
        access_token,
        expires_in,
        token_type,
      });
    }catch(e){
      console.log(e)
      res.status(e.response.status).send(e);
    }
  });

  /// Schema
  app.post("/schema",verifyHeaderToken, async (req, res) => {
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
  app.delete("/schema",verifyHeaderToken, async (_req, res) => {
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
  app.post("/plan", verifyHeaderToken,async (req, res) => {
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
      const objectInPlan = await redisClient.get(objectID);
      return res.status(409).send("Object Already Exists!!!" + objectInPlan);
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
    console.log(objectID);
    await redisClient.set(objectID, JSON.stringify(planBody), (err) => {
      if (err) res.status(500).send("Error in saving value");
    });
    return res.status(201).send("Object Successfully Saved");
  });
  app.get("/plan/:id",verifyHeaderToken, async (req, res) => {
    const key = req.params.id;
    const obj = await redisClient.get(key as string);

    if (!obj) {
      return res.status(404).send("No such Object Exists");
    }
    const clientEtag = req.header("If-None-Match");
    const generatedEtag = generateEtag(JSON.stringify(obj));

    if (clientEtag && clientEtag === generatedEtag) {
      return res.status(304).send();
    }

    return res.status(200).send(obj);
  });
  app.delete("/plan/:id",verifyHeaderToken, async (req, res) => {
    const key = req.params.id;
    const obj = await redisClient.get(key);

    if (!obj) {
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
  app.put("/plan/:id",verifyHeaderToken, async (req, res) => {
    try {
      const schema = await redisClient.get("schema");
      if (!schema)
        return res.status(404).send("No Schema Found! Add a Schema first");

      const key = req.params.id;
      const planBody = req.body;

      const validator = new Validator();
      const result = validator.validate(planBody, JSON.parse(schema as string));
      if (!result.valid)
        return res
          .status(400)
          .send("Invalid Object! Does not match the Schema provided");

      if (!isValidDate(planBody.creationDate)) {
        return res
          .status(400)
          .send("Invalid Date Object! Make sure it's in DD-MM-YYYY format");
      }
      if ((planBody as mainObject).objectId === key) {
        await redisClient.set(key, JSON.stringify(planBody), (err) => {
          if (err) return res.status(500).send("Error in saving value");
        });
      } else {
        await redisClient.set(
          (planBody as mainObject).objectId,
          JSON.stringify(planBody),
          (err) => {
            if (err) return res.status(500).send("Error in saving value");
          },
        );
      }

      // Decide on the status code based on the presence of the object before the operation.
      const statusCode = (await redisClient.get(key)) ? 200 : 201;
      return res.status(statusCode).send("Operation Successful");
    } catch (error) {
      return res.status(500).send("Internal Server Error");
    }
  });
  app.patch("/plan/:id", verifyHeaderToken,async (req, res) => {
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
      // const updatedObject = { ...JSON.parse(obj), ...updatedBody };

      const updatedObject = modifyObject(JSON.parse(obj), updatedBody);

      if (
        updatedObject &&
        typeof updatedObject === "string" &&
        updatedObject === "Wrong Object Type"
      ) {
        return res
          .status(400)
          .send(
            "Wrong Object Type Entered, Must be within the scope of the Schema",
          );
      }
      const validator = new Validator();
      const result = validator.validate(
        updatedObject,
        JSON.parse(schema as string),
      );
      if (!result.valid)
        return res
          .status(400)
          .send("Invalid Object! Does not match the Schema provided");

      if (!isValidDate((updatedObject as mainObject).creationDate)) {
        return res
          .status(400)
          .send("Invalid Date Object! Make sure it's in DD-MM-YYYY format");
      }
      if ((updatedObject as mainObject).objectId === key) {
        await redisClient.set(key, JSON.stringify(updatedObject), (err) => {
          if (err) return res.status(500).send("Error in saving value");
        });

        return res.status(200).send(updatedObject);
        ///same
      } else {
        await redisClient.set(
          (updatedObject as mainObject).objectId,
          JSON.stringify(updatedObject),
          (err) => {
            if (err) return res.status(500).send("Error in saving value");
          },
        );

        return res.status(200).send(updatedObject);
      }
    } catch (e) {
      return res.status(500).send("Internal Server Error");
    }
  });
};

main().catch((e) => {
  console.log("Error -", e);
});

/// api for jwt auth
/// put re complete
