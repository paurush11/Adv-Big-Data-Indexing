import "dotenv/config";
import express from "express";
import Redis from "ioredis";
import { isValidDate } from "./utils/dateValidator";
import {
  createElasticsearchMappings,
  deleteAllDocuments,
  fetchAllDocuments,
  generateRelationships,
  getMapping,
  reconstructObject,
  saveObject,
  saveObjectGenerate,
} from "./utils/elasticSearch";
import {
  fetchAccessToken,
  generateEtag,
  verifyHeaderToken,
} from "./utils/jwtAuth";
import { modifyObject } from "./utils/modifyObject";
import { mainObject } from "./utils/types";
const fs = require("fs");
const { Client } = require("@elastic/elasticsearch");
const { Validator } = require("jsonschema");

const main = async () => {
  const runcommand = `export NODE_EXTRA_CA_CERTS="/Users/paurushbatish/Desktop/react/bigdataIndexingProject/cert/http_ca.crt"`;
  const esClient = new Client({
    node: process.env.ES_NODE,
    auth: {
      username: process.env.ES_USERNAME || "",
      password: process.env.ES_PASSWORD || "",
      // apiKey: "bkNBZHk0c0JFd0x4WmUwbFdWQXk6VnBjcGVvMjJRUk9lTk54MkhrYUQzZw==",
    },
    ssl: {
      ca: fs.readFileSync("cert/http_ca.crt"),
      rejectUnauthorized: true, // Set to false only if you want to bypass SSL certificate validation (not recommended for production)
    },
  });
  // await getMapping(esClient);
    // await createElasticsearchMappings(esClient);
      // await esClient.indices.delete({ index: 'plans' });
    // deleteAllDocuments('plans', esClient)
  //  const val =  await fetchAllDocuments('plans', esClient)
  //  console.log(val.hits)

  const resp = await esClient.info();
  // console.log(resp);
  // console.log(resp)
  const app = express();
  const redisClient = new Redis();
  app.use(express.json());
  app.listen(process.env.PORT, () => {
    console.log("using server, ", process.env.PORT);
  });

  ///JWT AUTH
  app.get("/getToken", async (_req, res) => {
    try {
      const response = await fetchAccessToken();
      const { access_token, expires_in, token_type } = response;
      res.send({
        access_token,
        expires_in,
        token_type,
      });
    } catch (e) {
      console.log(e);
      res.status(e.response.status).send(e);
    }
  });

  /// Schema
  app.post("/schema", verifyHeaderToken, async (req, res) => {
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
  app.delete("/schema", verifyHeaderToken, async (_req, res) => {
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
  app.post("/plan", verifyHeaderToken, async (req, res) => {
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

    ///Now based on all
    // Object of that Id exists
    // Object is Valid
    // Object can have many Properities
    const fetchSavedObject = await saveObjectGenerate(
      planBody,
      redisClient,
      esClient,
    );
    // console.log(fetchSavedObject);

    try {
      saveObject(fetchSavedObject.objectId, fetchSavedObject, redisClient);
      // saveObject(objectID, planBody, redisClient);
    } catch (e) {
      res.status(500).send("Error in saving value");
    }

    /// etag is saved on plan body so that it can be verified before saving anything in patch and put request
    const generatedEtag = generateEtag(JSON.stringify(planBody));
    res.setHeader("ETag", generatedEtag);

    await esClient.index({
      index: "plans",
      id: objectID,
      body: fetchSavedObject, // savedObject contains references to child objects
    });

    await generateRelationships(planBody, esClient);

    return res.status(201).send("Object Successfully Saved");
  });
  app.get("/plan/:id", verifyHeaderToken, async (req, res) => {
    const key = req.params.id;
    const obj = await redisClient.get(key as string);

    if (!obj) {
      return res.status(404).send("No such Object Exists");
    }
    const clientEtag = req.header("If-None-Match");
    const mainObject = JSON.parse(obj);
    const reconstructedMainObject = await reconstructObject(
      mainObject,
      redisClient,
      esClient,
    );
    console.log(mainObject);
    const generatedEtag = generateEtag(JSON.stringify(reconstructedMainObject));

    if (clientEtag && clientEtag === generatedEtag) {
      return res.status(304).send();
    }
    res.setHeader("ETag", generatedEtag);
    return res.status(200).send(reconstructedMainObject);
  });
  app.delete("/plan/:id", verifyHeaderToken, async (req, res) => {
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
        // await esClient.delete({
        //   index: "plans",
        //   id: key,
        // });
        return res.status(200).send("Plan successfully deleted.");
      } else {
        return res.status(404).send("Plan not found.");
      }
    });
  });
  app.put("/plan/:id", verifyHeaderToken, async (req, res) => {
    try {
      const schema = await redisClient.get("schema");
      if (!schema)
        return res.status(404).send("No Schema Found! Add a Schema first");

      const key = req.params.id;
      const planBody = req.body;

      const obj = await redisClient.get(key);
      if (!obj) return res.status(404).send("No such Object Exists");
      ///verify the etag on reconstructed obj
      const reconstructedOldObject = await reconstructObject(
        JSON.parse(obj),
        redisClient,
        esClient,
      );

      const clientEtag = req.header("If-Match");
      let generatedEtag = generateEtag(reconstructedOldObject);

      if (clientEtag && clientEtag !== generatedEtag) {
        return res.status(412).send("Precondition failed");
      }
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
      ///object validated
      ///now it means that object is valid and fully safe to save.
      ///break down the object and make the desired changes

      const fetchSavedObject = await saveObjectGenerate(
        planBody,
        redisClient,
        esClient,
      );
      console.log(fetchSavedObject);

      try {
        saveObject(key, fetchSavedObject, redisClient);
        // saveObject(objectID, planBody, redisClient);
      } catch (e) {
        res.status(500).send("Error in saving value");
      }
      ///New Etag
      generatedEtag = generateEtag(JSON.stringify(planBody));
      res.setHeader("ETag", generatedEtag);
      const statusCode = 200;

      await esClient.update({
        index: "plans",
        id: key,
        body: {
          doc: fetchSavedObject,
        },
      });
      await generateRelationships(planBody, esClient);

      return res.status(statusCode).send(planBody);
    } catch (error) {
      return res.status(500).send("Internal Server Error");
    }
  });
  app.patch("/plan/:id", verifyHeaderToken, async (req, res) => {
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
      const reconstructedOldObject = await reconstructObject(
        JSON.parse(obj),
        redisClient,
        esClient,
      );
      const updatedObject = modifyObject(reconstructedOldObject, updatedBody);
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
      console.log(updatedObject);
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
      const clientEtag = req.header("If-Match");
      let generatedEtag = generateEtag(obj);
      /// this is etag value of saved object. Compared with that of provided by user

      if (clientEtag && clientEtag !== generatedEtag) {
        return res.status(412).send("Precondition failed");
      }

      /// We have made our new object and now also modified it. Now all we need to do is to save it just like the put request.
      const fetchSavedObject = await saveObjectGenerate(
        updatedObject,
        redisClient,
        esClient,
      );
      console.log(fetchSavedObject);

      try {
        saveObject(key, fetchSavedObject, redisClient);
        // saveObject(objectID, planBody, redisClient);
      } catch (e) {
        res.status(500).send("Error in saving value");
      }

      ///latest Etag
      generatedEtag = generateEtag(JSON.stringify(updatedObject));
      res.setHeader("ETag", generatedEtag);

      await esClient.update({
        index: "plans",
        id: key,
        body: {
          doc: fetchSavedObject,
        },
      });

      const reconstructedMainObject = await reconstructObject(
        fetchSavedObject,
        redisClient,
        esClient,
      );
      await generateRelationships(reconstructedMainObject, esClient);
      return res.status(200).send(reconstructedMainObject);
    } catch (e) {
      return res.status(500).send("Internal Server Error");
    }
  });

  // search
  app.get("/search/plans", verifyHeaderToken, async (req, res) => {
    try {
      const searchCriteria = req.query;
      console.log(searchCriteria);

      if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
        return res.status(400).send("Search criteria are required");
      }
      let query = {
        bool: {
          must: [] as any,
        },
      };
      // Build the query from the search criteria
      // Example criteria: { "planType": "inNetwork", "creationDate": "12-12-3000" }
      for (const [field, value] of Object.entries(searchCriteria)) {
        query.bool.must.push({ match_phrase: { [field]: value } });
      }

      const searchResult = await esClient.search({
        index: "plans", // Ensure this matches your index name
        body: {
          query,
        },
      });
      console.log(query.bool.must);
      return res.status(200).json(searchResult.hits.hits);
    } catch (error) {
      console.error("Error during search", error);
      return res.status(500).send("Internal Server Error");
    }
  });
  app.get("/allResults", verifyHeaderToken, async (req, res) => {
    try {
      const index = req.params;
      const documents = await fetchAllDocuments((index as any).index, esClient);
      res.json(documents.hits.hits);
    } catch (error) {
      res.status(500).send("Error fetching documents");
    }
  });
  app.get("/allChildrenHavingCopayLessOrGreater", verifyHeaderToken, async (req, res) => {
    try {
      const fields = req.query;
      let lessQ = false;
      if(fields.lt === 'true'){
        console.log(fields)
        lessQ = true;
      }
      const query = lessQ ? {
        query: {
          has_child: {
            type: "planCostShares", // Replace with the correct child type name
            query: {
              range: {
                copay: {
                  lt: fields.copay
                },
              },
            },
          },
        },
      }:{
        query: {
        has_child: {
          type: "planCostShares", // Replace with the correct child type name
          query: {
            range: {
              copay: {
                gt: fields.copay
              },
            },
          },
        },
      },

      };
     
      const body = await esClient.search({
        index: "plans", // Replace with your index name
        body: query,
      });
      const allPlans: any =[] ;
      body.hits.hits.forEach((element: any) => {
        allPlans.push(element._source);
      });
    
      const promises = allPlans.map((val: any)=>{
        return( async() =>{
          return await reconstructObject(val, redisClient, esClient);
        })();
      })
      const  allPlansRestructured = await  Promise.all(promises);
      return res.status(200).send(allPlansRestructured)
     
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).send("Error fetching documents");
    }
  });
  app.get(
    "/allParentsHaving",
    verifyHeaderToken,
    async (req, res) => {
      try {
        const fields = req.query;
        const query = {
          query: {
            has_child: {
              type: fields.type, // Replace with the correct child type name
              query: {
                bool: {
                  must: [] as any,
                },
              },
            },
          },
        };

        for (const [keys, vals] of Object.entries(fields)) {
          if(keys === "type"){
            continue;
          }else{
            query.query.has_child.query.bool.must.push({
              match_phrase: { [keys]: vals },
            });
          }
        }
        const body = await esClient.search({
          index: "plans", // Replace with your index name
          body: query,
        });
        const totalNoOfPlans = body.hits.total.value;
        const allPlans: any =[] ;
        body.hits.hits.forEach((element: any) => {
          allPlans.push(element._source);
        });
      
        const promises = allPlans.map((val: any)=>{
          return( async() =>{
            return await reconstructObject(val, redisClient, esClient);
          })();
        })
        const  allPlansRestructured = await  Promise.all(promises);
        // console.log(allPlansRestructured);
        
        // console.log(body.hits.total.value)
        return res.status(200).send(allPlansRestructured)
      } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).send("Error fetching documents");
      }
    },
  );
  app.get("/getMapping", verifyHeaderToken, async (_req, res) => {
    try {
      const response = await getMapping(esClient);
      res.status(200).send(response);
    } catch (e) {
      res.status(404).send("Not Found");
    }
  });
};

main().catch((e) => {
  console.log("Error -", e);
});
