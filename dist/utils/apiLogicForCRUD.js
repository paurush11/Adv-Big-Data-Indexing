"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postPlan = exports.getPlan = void 0;
const dateValidator_1 = require("./dateValidator");
const elasticSearch_1 = require("./elasticSearch");
const jwtAuth_1 = require("./jwtAuth");
const { Validator } = require("jsonschema");
const getPlan = async (id, clientETag, redisClient, esClient) => {
    const key = id;
    const obj = await redisClient.get(key);
    if (!obj) {
        let response = {
            send: "No such Object Exists",
            status: 404,
        };
        return response;
    }
    const clientEtag = clientETag;
    const mainObject = JSON.parse(obj);
    const reconstructedMainObject = await (0, elasticSearch_1.reconstructObject)(mainObject, redisClient, esClient);
    const generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedMainObject));
    if (clientEtag && clientEtag === generatedEtag) {
        let response = {
            send: "Same data",
            status: 304,
        };
        return response;
    }
    let response = {
        send: reconstructedMainObject,
        status: 200,
        Etag: generatedEtag,
    };
    return response;
};
exports.getPlan = getPlan;
const postPlan = async (planBody, redisClient, esClient) => {
    console.log("Adding a plan to the redis client");
    const schema = await redisClient.get("schema");
    if (!schema) {
        let response = {
            send: "No Schema Found! Add a Schema first",
            status: 404,
        };
        return response;
    }
    const objectID = planBody.objectId !== undefined ? planBody.objectId : null;
    if (!objectID) {
        let response = {
            send: "Invalid Object! Does not match the Schema provided",
            status: 400,
        };
        return response;
    }
    const obj = await redisClient.exists(objectID);
    if (obj) {
        const objectInPlan = await redisClient.get(objectID);
        let response = {
            send: "Object Already Exists!!!" + objectInPlan,
            status: 409,
        };
        return response;
    }
    const validator = new Validator();
    const result = validator.validate(planBody, JSON.parse(schema));
    if (!result.valid) {
        let response = {
            send: "Invalid Object! Does not match the Schema provided",
            status: 400,
        };
        return response;
    }
    const creationDateValid = (0, dateValidator_1.isValidDate)(planBody.creationDate);
    if (!creationDateValid) {
        let response = {
            send: "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format",
            status: 400,
        };
        return response;
    }
    const fetchSavedObject = await (0, elasticSearch_1.saveObjectGenerate)(planBody, redisClient, esClient);
    try {
        (0, elasticSearch_1.saveObject)(fetchSavedObject.objectId, fetchSavedObject, redisClient);
    }
    catch (e) {
        let response = {
            send: "Error in saving value",
            status: 500,
        };
        return response;
    }
    const generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(planBody));
    let response = {
        status: 201,
        send: "Object Successfully Saved",
        Etag: generatedEtag,
    };
    await esClient.index({
        index: "plans",
        id: objectID,
        body: fetchSavedObject,
    });
    await (0, elasticSearch_1.generateRelationships)(planBody, esClient);
    return response;
};
exports.postPlan = postPlan;
//# sourceMappingURL=apiLogicForCRUD.js.map