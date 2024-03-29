"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateChildWithParent = exports.saveObjectRecursive = exports.saveObjectInRedis = exports.reconstructObject = exports.getMapping = exports.generateRelationshipsStart = exports.generateRelationshipsRecursive = exports.fetchObjectById = exports.fetchAllDocuments = exports.deleteObject = exports.deleteAllDocuments = exports.createElasticsearchMappings = exports.ObjectExists = void 0;
const saveObjectInRedis = async (objectID, planBody, redisClient) => {
    await redisClient.set(objectID, JSON.stringify(planBody), (err) => {
        if (err)
            throw Error(err.message);
    });
};
exports.saveObjectInRedis = saveObjectInRedis;
const saveObjectRecursive = async (planBody, redisClient) => {
    const savedObject = {};
    for (const [key, value] of Object.entries(planBody)) {
        if (typeof value === "object" && value !== null) {
            if (Array.isArray(value)) {
                savedObject[key] = [];
                const promises = value.map((val) => {
                    return (async () => {
                        saveObjectRecursive(val, redisClient);
                        await saveObjectInRedis(val.objectType + "_" + val.objectId, val, redisClient);
                        return val;
                    })();
                });
                savedObject[key] = await Promise.all(promises);
            }
            else {
                saveObjectRecursive(value, redisClient);
                savedObject[key] = value;
                await saveObjectInRedis(value.objectType + "_" + value.objectId, value, redisClient);
            }
        }
        else {
            savedObject[key] = value;
        }
    }
    await saveObjectInRedis(planBody.objectType + "_" + planBody.objectId, planBody, redisClient);
    return savedObject;
};
exports.saveObjectRecursive = saveObjectRecursive;
const generateRelationshipsStart = async (mainObject, esClient) => {
    console.log({
        index: "plans",
        id: mainObject.objectType + "_" + mainObject.objectId,
        body: {
            doc: {
                relationship: { name: "plan" },
            },
        },
    }, null, 2);
    try {
        await esClient.update({
            index: "plans",
            id: mainObject.objectType + "_" + mainObject.objectId,
            body: {
                doc: {
                    relationship: { name: "plan" },
                },
            },
        });
    }
    catch (E) {
        console.log(E);
    }
    await generateRelationshipsRecursive(mainObject, esClient);
};
exports.generateRelationshipsStart = generateRelationshipsStart;
const generateRelationshipsRecursive = async (mainObject, esClient) => {
    for (const [keys, value] of Object.entries(mainObject)) {
        if (typeof value === "object" && value !== null) {
            if (Array.isArray(value)) {
                for (const service of value) {
                    await generateRelationshipsRecursive(service, esClient);
                    await updateChildWithParent(service.objectType + "_" + service.objectId, mainObject.objectType + "_" + mainObject.objectId, esClient, mainObject.objectType + "_" + service.objectType);
                }
            }
            else {
                await generateRelationshipsRecursive(value, esClient);
                await updateChildWithParent(value.objectType + "_" + value.objectId, mainObject.objectType + "_" + mainObject.objectId, esClient, mainObject.objectType + "_" + value.objectType);
            }
        }
    }
};
exports.generateRelationshipsRecursive = generateRelationshipsRecursive;
const updateChildWithParent = async (childId, parentId, esClient, planType) => {
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
    }
    catch (error) {
        console.error(`Error updating child ${childId} relationship:`, error);
    }
};
exports.updateChildWithParent = updateChildWithParent;
const createElasticsearchMappings = async (esClient) => {
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
            },
        },
    };
    try {
        const indexExists = await esClient.indices.exists({ index: indexName });
        if (!indexExists.body) {
            await esClient.indices.create({ index: indexName, body: mapping });
            console.log(`Index ${indexName} created successfully.`);
        }
        else {
            console.log(`Index ${indexName} already exists.`);
        }
    }
    catch (error) {
        console.error("Error creating Elasticsearch index:", error);
    }
};
exports.createElasticsearchMappings = createElasticsearchMappings;
async function deleteAllDocuments(index, client) {
    try {
        await client.deleteByQuery({
            index: index,
            body: {
                query: {
                    match_all: {},
                },
            },
        });
        console.log(`All documents deleted from index ${index}`);
    }
    catch (error) {
        console.error(`Error deleting documents from index ${index}:`, error);
    }
}
exports.deleteAllDocuments = deleteAllDocuments;
async function fetchAllDocuments(index, client) {
    try {
        return await client.search({
            index: index,
            body: {
                query: {
                    match_all: {},
                },
                size: 1000,
            },
        });
    }
    catch (error) {
        console.error("Error fetching documents:", error);
    }
}
exports.fetchAllDocuments = fetchAllDocuments;
async function ObjectExists(objectId, esClient, planBody) {
    try {
        const result = await esClient.get({
            index: "plans",
            id: objectId,
        });
        if (result) {
            console.log("this is the result\n\n\n");
            if (JSON.stringify(planBody) === JSON.stringify(result._source))
                return true;
        }
        return false;
    }
    catch (error) {
        if (error.meta && error.meta.statusCode === 404) {
            return false;
        }
        else {
            console.error("Error checking if object exists:", error);
            throw error;
        }
    }
}
exports.ObjectExists = ObjectExists;
async function fetchObjectById(objectId, redisClient, esClient) {
    let object = await redisClient.get(objectId);
    if (!object) {
        const result = await esClient.get({
            index: "plans",
            id: objectId,
        });
        object = result.body._source;
    }
    return JSON.parse(object);
}
exports.fetchObjectById = fetchObjectById;
async function reconstructObject(mainObject, redisClient, esClient) {
    const reconstructedObject = {};
    for (const [key, value] of Object.entries(mainObject)) {
        if (typeof value === "object" && value !== null) {
            if (Array.isArray(value)) {
                reconstructedObject[key] = [];
                for (const element of value) {
                    if (element.objectId) {
                        const fetchedObject = await fetchObjectById(element.objectType + "_" + element.objectId, redisClient, esClient);
                        reconstructedObject[key].push(fetchedObject);
                    }
                }
            }
            else if (value.objectId) {
                reconstructedObject[key] = await fetchObjectById(value.objectType + "_" + value.objectId, redisClient, esClient);
            }
            else {
                reconstructedObject[key] = await reconstructObject(value, redisClient, esClient);
            }
        }
        else {
            reconstructedObject[key] = value;
        }
    }
    return reconstructedObject;
}
exports.reconstructObject = reconstructObject;
const getMapping = async (client) => {
    try {
        const response = await client.indices.getMapping({
            index: "plans",
        });
        return response;
    }
    catch (error) {
        console.error("Error getting mapping:", error);
    }
};
exports.getMapping = getMapping;
async function deleteObject(objectId, redisClient, esClient) {
    try {
        const objectStr = await redisClient.get(objectId);
        if (!objectStr) {
            throw new Error(`Object with ID ${objectId} not found in Redis`);
        }
        const object = JSON.parse(objectStr);
        for (const [key, value] of Object.entries(object)) {
            if (typeof value === "object" && value !== null) {
                if (Array.isArray(value)) {
                    for (const child of value) {
                        await deleteObject(child.objectType + "_" + child.objectId, redisClient, esClient);
                    }
                }
                else {
                    await deleteObject(value.objectType + "_" + value.objectId, redisClient, esClient);
                }
            }
        }
        console.log(objectId);
        await redisClient.del(objectId);
        await esClient.delete({
            index: "plans",
            id: objectId,
        });
        console.log(`Object with ID ${objectId} and its children deleted successfully.`);
    }
    catch (err) {
        console.log(err);
    }
}
exports.deleteObject = deleteObject;
//# sourceMappingURL=elasticSearch.js.map