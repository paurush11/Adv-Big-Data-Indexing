import Redis from "ioredis";
import { mainObject } from "./types";

const saveObject = async (
  objectID: string,
  planBody: any,
  redisClient: Redis,
) => {
  // console.log(planBody)
  await redisClient.set(objectID, JSON.stringify(planBody), (err) => {
    if (err) throw Error(err.message);
  });
};
const saveObjectGenerate = async (
  planBody: any,
  redisClient: Redis,
  esClient: any,
) => {
  const savedObject = {} as any;

  for (const [key, value] of Object.entries(planBody)) {
    if (typeof value === "object" && value !== null) {
      // console.log(key);
      if (Array.isArray(value)) {
        savedObject[key] = [];

        const promises = value.map((val) => {
          return (async () => {
            saveObjectGenerate(val, redisClient, esClient);
            await saveObject(val.objectId, val, redisClient);
            await esClient.index({
              index: "plans",
              id: val.objectId,
              body: val,
            });
            return { objectId: val.objectId };
          })();
        });

        savedObject[key] = await Promise.all(promises);
      } else {
        ///key can only be planCostShares, linkedService, linkedService, planserviceCostShares

        saveObjectGenerate(value, redisClient, esClient);
        savedObject[key] = { objectId: (value as any).objectId };
        ///Every Value has an objectId.
        ///Save the Object in redis with id as value.objectId and value as value;
        await saveObject((value as any).objectId, value, redisClient);
        await esClient.index({
          index: "plans",
          id: (value as any).objectId,
          body: value,
        });
      }
    } else {
      savedObject[key] = value;
    }
  }

  return savedObject;
};
const generateRelationships = async (mainObject: mainObject, esClient: any) => {
  //planCostShares
  if (mainObject.planCostShares && mainObject.planCostShares.objectId) {
    ///save this
    await updateChildWithParent(
      mainObject.planCostShares.objectId,
      mainObject.objectId,
      esClient,
      "planCostShares",
    );
  }
  ///linkedPlanServices
  if (
    mainObject.linkedPlanServices &&
    Array.isArray(mainObject.linkedPlanServices)
  ) {
    for (const service of mainObject.linkedPlanServices) {
      if (service.objectId) {
        ///service should have linkedservice and planservicecostshares
        if (service.linkedService && service.linkedService.objectId) {
          await updateChildWithParent(
            service.linkedService.objectId,
            service.objectId,
            esClient,
            "linkedService",
          );
        }
        if (
          service.planserviceCostShares &&
          service.planserviceCostShares.objectId
        ) {
          await updateChildWithParent(
            service.planserviceCostShares.objectId,
            service.objectId,
            esClient,
            "planserviceCostShares",
          );
        }

        await updateChildWithParent(
          service.objectId,
          mainObject.objectId,
          esClient,
          "linkedPlanServices",
        );
        //save this
      }
    }
  }
  await esClient.update({
    index: "plans",
    id: mainObject.objectId,
    body: {
      doc: {
        relationship: { name: "plan" },
      },

      // ... mainObject fields ...
    },
  });
};
const updateChildWithParent = async (
  childId: string,
  parentId: string,
  esClient: any,
  planType: string,
) => {
  try {
    await esClient.update({
      index: "plans",
      id: childId,
      routing: parentId,
      body: {
        doc: {
          relationship: {
            name: planType,
            parent: parentId,
          },
        },
      },
    });
  } catch (error) {
    console.error(`Error updating child ${childId} relationship:`, error);
  }
};
const createElasticsearchMappings = async (esClient: any) => {
  const indexName = "plans";
  const mapping = {
    mappings: {
      properties: {
        relationship: {
          type: "join",
          relations: {
            plan: ["planCostShares", "linkedPlanServices"],
            linkedPlanService: ["linkedService", "planserviceCostShares"],
          },
        },
        // ... additional field mappings based on your data structure ...
      },
    },
  };

  try {
    // Check if the index already exists
    const indexExists = await esClient.indices.exists({ index: indexName });
    if (!indexExists.body) {
      // Create the index with the mapping
      await esClient.indices.create({ index: indexName, body: mapping });
      console.log(`Index ${indexName} created successfully.`);
    } else {
      console.log(`Index ${indexName} already exists.`);
    }
  } catch (error) {
    console.error("Error creating Elasticsearch index:", error);
  }
};
async function deleteAllDocuments(index: any, client: any) {
  try {
    await client.deleteByQuery({
      index: index,
      body: {
        query: {
          match_all: {}, // This matches all documents
        },
      },
    });
    console.log(`All documents deleted from index ${index}`);
  } catch (error) {
    console.error(`Error deleting documents from index ${index}:`, error);
  }
}
async function fetchAllDocuments(index: any, client: any) {
  try {
    return await client.search({
      index: index,
      body: {
        query: {
          match_all: {},
        },
        size: 1000, // Adjust the size as needed
      },
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
  }
}
async function fetchObjectById(
  objectId: string,
  redisClient: Redis,
  esClient: any,
) {
  // Try to get the object from Redis
  let object = await redisClient.get(objectId);
  if (!object) {
    // If not in Redis, fetch from Elasticsearch
    const result = await esClient.get({
      index: "plans",
      id: objectId,
    });
    object = result.body._source; // Assuming the object is stored in the _source field
  }

  return JSON.parse(object as string);
}
async function reconstructObject(
  mainObject: any,
  redisClient: Redis,
  esClient: any,
) {
  const reconstructedObject = {} as any;

  for (const [key, value] of Object.entries(mainObject)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        // If it's an array, process each element
        reconstructedObject[key] = [];
        for (const element of value) {
          if (element.objectId) {
            const fetchedObject = await fetchObjectById(
              element.objectId,
              redisClient,
              esClient,
            );
            reconstructedObject[key].push(fetchedObject);
          }
        }
      } else if ((value as any).objectId) {
        // If it's an object with an objectId, fetch the object
        reconstructedObject[key] = await fetchObjectById(
          (value as any).objectId,
          redisClient,
          esClient,
        );
      } else {
        // If it's an object without an objectId, recursively process it
        reconstructedObject[key] = await reconstructObject(
          value,
          redisClient,
          esClient,
        );
      }
    } else {
      // If it's not an object, copy it as is
      reconstructedObject[key] = value;
    }
  }

  return reconstructedObject;
}
const getMapping = async (client: any) => {
  try {
    const response = await client.indices.getMapping({
      index: "plans",
    });
    return response;
  } catch (error) {
    console.error("Error getting mapping:", error);
  }
};

export {
  saveObject,
  saveObjectGenerate,
  generateRelationships,
  updateChildWithParent,
  createElasticsearchMappings,
  deleteAllDocuments,
  fetchAllDocuments,
  fetchObjectById,
  reconstructObject,
  getMapping,
};
