import Redis from "ioredis";
import { mainObject } from "./types";

const saveObjectInRedis = async (
  objectID: string,
  planBody: any,
  redisClient: Redis,
) => {
  await redisClient.set(objectID, JSON.stringify(planBody), (err) => {
    if (err) throw Error(err.message);
  });
};
const saveObjectRecursive = async (planBody: any, redisClient: Redis) => {
  const savedObject = {} as any;
  for (const [key, value] of Object.entries(planBody)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        savedObject[key] = [];
        const promises = value.map((val) => {
          return (async () => {
            saveObjectRecursive(val, redisClient);
            await saveObjectInRedis(
              (val as any).objectType + "_" + (val as any).objectId,
              val,
              redisClient,
            );
            return val;
          })();
        });
        savedObject[key] = await Promise.all(promises);
      } else {
        saveObjectRecursive(value, redisClient);
        savedObject[key] = value;
        await saveObjectInRedis(
          (value as any).objectType + "_" + (value as any).objectId,
          value,
          redisClient,
        );
      }
    } else {
      savedObject[key] = value;
    }
  }
  await saveObjectInRedis(
    (planBody as any).objectType + "_" + (planBody as any).objectId,
    planBody,
    redisClient,
  );
  return savedObject;
};
const generateRelationshipsStart = async (mainObject: any, esClient: any) => {
  await esClient.update({
    index: "plans",
    id: mainObject.objectType + "_" + mainObject.objectId,
    body: {
      doc: {
        relationship: { name: "plan" },
      },

      // ... mainObject fields ...
    },
  });
  await generateRelationshipsRecursive(mainObject, esClient);
};
const generateRelationshipsRecursive = async (
  mainObject: any,
  esClient: any,
) => {
  //planCostShares
  for (const [keys, value] of Object.entries(mainObject)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        for (const service of value) {
          await generateRelationshipsRecursive(service, esClient);
          await updateChildWithParent(
            (service as any).objectType + "_" + (service as any).objectId, //<- child object id
            mainObject.objectType + "_" + mainObject.objectId, //<-- parent object id
            esClient,
            mainObject.objectType + "_" + (service as any).objectType,
          );
        }
      } else {
        await generateRelationshipsRecursive(value, esClient);
        await updateChildWithParent(
          (value as any).objectType + "_" + (value as any).objectId, //<- child object id
          mainObject.objectType + "_" + mainObject.objectId, //<-- parent object id
          esClient,
          mainObject.objectType + "_" + (value as any).objectType,
        );
      }
    }
  }
};
//fit for generic purposes
const updateChildWithParent = async (
  childId: string,
  parentId: string,
  esClient: any,
  planType: string,
) => {
  try {
    // console.log(
    //   JSON.stringify(
    //     {
    //       index: "plans",
    //       id: childId,
    //       routing: parentId,
    //       body: {
    //         doc: {
    //           relationship: {
    //             name: planType,
    //             parent: parentId,
    //           },
    //         },
    //       },
    //     },
    //     null,
    //     2,
    //   ),
    // );
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
            plan: ["plan_membercostshare", "plan_planservice"],
            plan_planservice: [
              "planservice_membercostshare",
              "planservice_service",
            ],
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
async function ObjectExists(objectId: string, esClient: any) {
  try {
    const result = await esClient.get({
      index: "plans",
      id: objectId,
    });
    return result ? true : false;
  } catch (error) {
    // Check if the error is because the document was not found
    if (error.meta && error.meta.statusCode === 404) {
      return false;
    } else {
      // Log and rethrow other types of errors
      console.error("Error checking if object exists:", error);
      throw error;
    }
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
              element.objectType + "_" + element.objectId,
              redisClient,
              esClient,
            );
            reconstructedObject[key].push(fetchedObject);
          }
        }
      } else if ((value as any).objectId) {
        // If it's an object with an objectId, fetch the object
        reconstructedObject[key] = await fetchObjectById(
          (value as any).objectType + "_" + (value as any).objectId,
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
async function deleteObject(
  objectId: string,
  redisClient: Redis,
  esClient: any,
) {
  try {
    const objectStr = await redisClient.get(objectId);
    if (!objectStr) {
      throw new Error(`Object with ID ${objectId} not found in Redis`);
    }
    const object = JSON.parse(objectStr);
    for (const [key, value] of Object.entries(object)) {
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          // Value is an array of child objects
          for (const child of value) {
            await deleteObject(
              child.objectType + "_" + child.objectId,
              redisClient,
              esClient,
            );
          }
        } else {
          // Value is a single child object
          await deleteObject(
            (value as any).objectType + "_" + (value as any).objectId,
            redisClient,
            esClient,
          );
        }
      }
    }
    console.log(objectId);
    await redisClient.del(objectId);

    // Delete the parent object from Elasticsearch
    await esClient.delete({
      index: "plans",
      id: objectId,
    });
    console.log(
      `Object with ID ${objectId} and its children deleted successfully.`,
    );
  } catch (err) {
    console.log(err);
  }
}

export {
  saveObjectInRedis,
  saveObjectRecursive,
  generateRelationshipsStart,
  generateRelationshipsRecursive,
  updateChildWithParent,
  createElasticsearchMappings,
  deleteAllDocuments,
  fetchAllDocuments,
  fetchObjectById,
  reconstructObject,
  getMapping,
  ObjectExists,
  deleteObject,
};
