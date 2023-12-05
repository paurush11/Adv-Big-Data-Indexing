"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnBodyResponse = exports.patchPlan = exports.putPlan = exports.postPlan = exports.checkIfObjectExistsNow = exports.deletePlan = exports.getPlan = exports.deleteSchema = exports.postSchema = exports.getToken = void 0;
const dateValidator_1 = require("./dateValidator");
const elasticSearch_1 = require("./elasticSearch");
const jwtAuth_1 = require("./jwtAuth");
const rabbitMq_1 = require("./rabbitMq");
const modifyObject_1 = require("./modifyObject");
const { Validator } = require("jsonschema");
const checkIfObjectExistsNow = async (fetchSavedObject, esClient, planBody, statusCode, generatedEtag) => {
    const result = await (0, elasticSearch_1.ObjectExists)(fetchSavedObject.objectType + "_" + fetchSavedObject.objectId, esClient, fetchSavedObject);
    console.log("Checking if object exists...");
    if (result) {
        console.log("Object found:", result);
        console.log("Continuing with relationship generation...");
        await (0, elasticSearch_1.generateRelationshipsStart)(planBody, esClient);
        return returnBodyResponse(false, statusCode, "Object Successfully Saved", generatedEtag);
    }
    else {
        console.log("Object not found, retrying...");
        await new Promise((resolve) => setTimeout(resolve, 200));
        return checkIfObjectExistsNow(fetchSavedObject, esClient, planBody, statusCode, generatedEtag);
    }
};
exports.checkIfObjectExistsNow = checkIfObjectExistsNow;
const getPlan = async (key, redisClient, esClient, clientEtag) => {
    const obj = await fetchObjectFromRedis(key, redisClient);
    if (obj === "No Such Object Exists") {
        return returnBodyResponse(true, 404, "No such Object Exists");
    }
    const mainObject = JSON.parse(obj);
    const reconstructedMainObject = await (0, elasticSearch_1.reconstructObject)(mainObject, redisClient, esClient);
    const generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedMainObject));
    if (clientEtag && clientEtag === generatedEtag) {
        return returnBodyResponse(false, 304, "No changes", generatedEtag);
    }
    return returnBodyResponse(false, 200, reconstructedMainObject, generatedEtag);
};
exports.getPlan = getPlan;
const postPlan = async (key, redisClient, esClient, planBody) => {
    console.log("Adding a plan to the redis client");
    const schema = await fetchObjectFromRedis("schema", redisClient);
    if (schema === "No Such Object Exists") {
        return returnBodyResponse(true, 404, "No such Object Exists");
    }
    const objectID = planBody.objectId !== undefined ? planBody.objectId : null;
    if (!objectID || key !== planBody.objectType + "_" + objectID) {
        return returnBodyResponse(true, 400, "Invalid Object! Does not match the Schema provided");
    }
    const checkIfObjectExists = await checkObjectExists(planBody.objectType + "_" + objectID, redisClient);
    if (checkIfObjectExists) {
        return returnBodyResponse(true, 409, "Object Already Exists");
    }
    const validator = new Validator();
    const result = validator.validate(planBody, JSON.parse(schema));
    if (!result.valid) {
        return returnBodyResponse(true, 400, "Invalid Object! Does not match the Schema provided");
    }
    const creationDateValid = (0, dateValidator_1.isValidDate)(planBody.creationDate);
    if (!creationDateValid) {
        return returnBodyResponse(true, 400, "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format");
    }
    try {
        const fetchSavedObject = await (0, elasticSearch_1.saveObjectRecursive)(planBody, redisClient);
        const generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(planBody));
        await (0, rabbitMq_1.sendESRequest)(fetchSavedObject, "POST");
        return await checkIfObjectExistsNow(fetchSavedObject, esClient, planBody, 201, generatedEtag);
    }
    catch (e) {
        return returnBodyResponse(true, 500, "Error in saving object");
    }
};
exports.postPlan = postPlan;
const putPlan = async (key, redisClient, esClient, planBody, clientEtag) => {
    console.log("Putting a plan to the redis client");
    const schema = await fetchObjectFromRedis("schema", redisClient);
    if (schema === "No Such Object Exists") {
        return returnBodyResponse(true, 404, "No such Object Exists");
    }
    const objectID = planBody.objectId !== undefined ? planBody.objectId : null;
    if (!objectID || key !== planBody.objectType + "_" + objectID) {
        return returnBodyResponse(true, 400, "Invalid Object! Does not match the Schema provided");
    }
    const checkIfObjectExists = await fetchObjectFromRedis(planBody.objectType + "_" + objectID, redisClient);
    if (checkIfObjectExists === "No Such Object Exists") {
        return returnBodyResponse(true, 409, "Object does not Exist, consider using a Post Operation");
    }
    const reconstructedOldObject = await (0, elasticSearch_1.reconstructObject)(JSON.parse(checkIfObjectExists), redisClient, esClient);
    let generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedOldObject));
    if (clientEtag && clientEtag !== generatedEtag) {
        return returnBodyResponse(true, 412, "Precondition failed");
    }
    const validator = new Validator();
    const result = validator.validate(planBody, JSON.parse(schema));
    if (!result.valid) {
        return returnBodyResponse(true, 400, "Invalid Object! Does not match the Schema provided");
    }
    const creationDateValid = (0, dateValidator_1.isValidDate)(planBody.creationDate);
    if (!creationDateValid) {
        return returnBodyResponse(true, 400, "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format");
    }
    try {
        const fetchSavedObject = await (0, elasticSearch_1.saveObjectRecursive)(planBody, redisClient);
        generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(planBody));
        await (0, rabbitMq_1.sendESRequest)(fetchSavedObject, "PUT");
        return await checkIfObjectExistsNow(fetchSavedObject, esClient, planBody, 200, generatedEtag);
    }
    catch (e) {
        return returnBodyResponse(true, 500, "Error in saving object");
    }
};
exports.putPlan = putPlan;
const patchPlan = async (key, redisClient, esClient, planBody, clientEtag) => {
    console.log("Patching a plan to the redis client");
    const schema = await fetchObjectFromRedis("schema", redisClient);
    if (schema === "No Such Object Exists") {
        return returnBodyResponse(true, 404, "No such Object Exists");
    }
    const objectID = key;
    if (!objectID) {
        return returnBodyResponse(true, 400, "Invalid Object! Does not match the Schema provided");
    }
    const checkIfObjectExists = await fetchObjectFromRedis(objectID, redisClient);
    if (checkIfObjectExists === "No Such Object Exists") {
        return returnBodyResponse(true, 409, "Object does not Exist, consider using a Post Operation");
    }
    const reconstructedOldObject = await (0, elasticSearch_1.reconstructObject)(JSON.parse(checkIfObjectExists), redisClient, esClient);
    const updatedObject = (0, modifyObject_1.modifyObject)(reconstructedOldObject, planBody);
    if (updatedObject &&
        typeof updatedObject === "string" &&
        updatedObject === "Wrong Object Type") {
        return returnBodyResponse(true, 400, "Wrong Object Type Entered, Must be within the scope of the Schema");
    }
    let generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(reconstructedOldObject));
    if (clientEtag && clientEtag !== generatedEtag) {
        return returnBodyResponse(true, 412, "Precondition failed");
    }
    const validator = new Validator();
    const result = validator.validate(updatedObject, JSON.parse(schema));
    if (!result.valid) {
        return returnBodyResponse(true, 400, "Invalid Object! Does not match the Schema provided");
    }
    const creationDateValid = (0, dateValidator_1.isValidDate)(updatedObject.creationDate);
    if (!creationDateValid) {
        return returnBodyResponse(true, 400, "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format");
    }
    try {
        const fetchSavedObject = await (0, elasticSearch_1.saveObjectRecursive)(updatedObject, redisClient);
        generatedEtag = (0, jwtAuth_1.generateEtag)(JSON.stringify(updatedObject));
        await (0, rabbitMq_1.sendESRequest)(fetchSavedObject, "PATCH");
        return await checkIfObjectExistsNow(fetchSavedObject, esClient, updatedObject, 200, generatedEtag);
    }
    catch (e) {
        return returnBodyResponse(true, 500, "Error in saving object");
    }
};
exports.patchPlan = patchPlan;
const deletePlan = async (key, redisClient, esClient) => {
    const obj = await fetchObjectFromRedis(key, redisClient);
    if (obj === "No Such Object Exists") {
        return returnStringResponse(true, 404, "No such Object Exists");
    }
    try {
        await (0, elasticSearch_1.deleteObject)(key, redisClient, esClient);
        return returnStringResponse(false, 200, "Plan successfully deleted.");
    }
    catch (e) {
        return returnStringResponse(true, 500, "Error deleting plan.");
    }
};
exports.deletePlan = deletePlan;
const returnStringResponse = (hasError, statusCode, message) => {
    return {
        response: {
            isError: hasError,
            status: statusCode,
            message: message,
        },
    };
};
const returnBodyResponse = (hasError, statusCode, body, etag) => {
    return {
        response: {
            isError: hasError,
            status: statusCode,
            body: body,
            eTag: etag,
        },
    };
};
exports.returnBodyResponse = returnBodyResponse;
const checkObjectExists = async (key, redisClient) => {
    const data = await redisClient.exists(key);
    return data;
};
const fetchObjectFromRedis = async (key, redisClient) => {
    const obj = await redisClient.get(key);
    return obj ? obj : "No Such Object Exists";
};
const deleteValueInRedis = async (key, redisClient, callBack) => {
    const exists = await checkObjectExists(key, redisClient);
    if (!exists) {
        return callBack(true, 500, "No such value to delete");
    }
    try {
        await redisClient.del(key);
        return callBack(false, 200, "Schema is deleted");
    }
    catch (e) {
        return callBack(true, 500, "Error in deleting Schema");
    }
};
const setValueInRedis = async (key, value, redisClient, callBack) => {
    const data = await checkObjectExists(key, redisClient);
    if (data) {
        return callBack(true, 409, "Schema Already Exists");
    }
    try {
        await redisClient.set(key, JSON.stringify(value));
        return callBack(false, 200, "The Schema is Added");
    }
    catch (e) {
        return callBack(true, 500, "Error in adding Schema");
    }
};
const postSchema = async (schema, redisClient) => {
    console.log("Adding Json Schema to the redis client");
    return await setValueInRedis("schema", schema, redisClient, returnStringResponse);
};
exports.postSchema = postSchema;
const deleteSchema = async (key, redisClient) => {
    console.log("Deleting Json Schema to the redis client");
    return await deleteValueInRedis(key, redisClient, returnStringResponse);
};
exports.deleteSchema = deleteSchema;
const getToken = async () => {
    try {
        const response = await (0, jwtAuth_1.fetchAccessToken)();
        const { access_token, expires_in, token_type } = response;
        return {
            response: {
                access_token,
                expires_in,
                token_type,
            },
        };
    }
    catch (e) {
        console.log(e);
        return {
            error: {
                message: e,
                status: e.response.status,
            },
        };
    }
};
exports.getToken = getToken;
//# sourceMappingURL=apiLogicForCRUD.js.map