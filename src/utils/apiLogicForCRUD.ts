import { isValidDate } from "./dateValidator";
import {
  generateRelationships,
  reconstructObject,
  saveObject,
  saveObjectGenerate,
} from "./elasticSearch";
import { generateEtag } from "./jwtAuth";
import { customResponseType } from "./types";
const { Validator } = require("jsonschema");

export const getPlan = async (
  id: string,
  clientETag: string,
  redisClient: any,
  esClient: any,
) => {
  const key = id;

  const obj = await redisClient.get(key as string);
  if (!obj) {
    let response = {
      send: "No such Object Exists",
      status: 404,
    } as customResponseType;
    return response;
  }
  const clientEtag = clientETag;
  const mainObject = JSON.parse(obj);
  const reconstructedMainObject = await reconstructObject(
    mainObject,
    redisClient,
    esClient,
  );
  const generatedEtag = generateEtag(JSON.stringify(reconstructedMainObject));

  if (clientEtag && clientEtag === generatedEtag) {
    let response = {
      send: "Same data",
      status: 304,
    } as customResponseType;
    return response;
  }
  let response = {
    send: reconstructedMainObject,
    status: 200,
    Etag: generatedEtag,
  } as customResponseType;
  return response;
};

export const postPlan = async (
  planBody: any,
  redisClient: any,
  esClient: any,
) => {
  /// Adding Schema
  console.log("Adding a plan to the redis client");
  const schema = await redisClient.get("schema");

  if (!schema) {
    let response = {
      send: "No Schema Found! Add a Schema first",
      status: 404,
    } as customResponseType;
    return response;
  }
  const objectID: string =
    planBody.objectId !== undefined ? planBody.objectId : null;

  // validate Object Id
  if (!objectID) {
    let response = {
      send: "Invalid Object! Does not match the Schema provided",
      status: 400,
    } as customResponseType;
    return response;
  }

  // Check if Object Exists
  const obj = await redisClient.exists(objectID);
  if (obj) {
    const objectInPlan = await redisClient.get(objectID);
    let response = {
      send: "Object Already Exists!!!" + objectInPlan,
      status: 409,
    } as customResponseType;
    return response;
  }

  // Validate Object
  const validator = new Validator();
  const result = validator.validate(planBody, JSON.parse(schema as string));

  if (!result.valid) {
    let response = {
      send: "Invalid Object! Does not match the Schema provided",
      status: 400,
    } as customResponseType;
    return response;
  }

  // Check Validity of Date
  const creationDateValid = isValidDate(planBody.creationDate);
  if (!creationDateValid) {
    let response = {
      send: "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format",
      status: 400,
    } as customResponseType;
    return response;
  }
  // Now based on all
  // Object of that Id exists
  // Object is Valid
  // Object can have many Properities
  const fetchSavedObject = await saveObjectGenerate(
    planBody,
    redisClient,
    esClient,
  );
  try {
    saveObject(fetchSavedObject.objectId, fetchSavedObject, redisClient);
  } catch (e) {
    let response = {
      send: "Error in saving value",
      status: 500,
    } as customResponseType;
    return response;
  }

  /// etag is saved on plan body so that it can be verified before saving anything in patch and put request
  const generatedEtag = generateEtag(JSON.stringify(planBody));
  let response = {
    status: 201,
    send: "Object Successfully Saved",
    Etag: generatedEtag,
  } as customResponseType;

  await esClient.index({
    index: "plans",
    id: objectID,
    body: fetchSavedObject, // savedObject contains references to child objects
  });

  await generateRelationships(planBody, esClient);

  return response;
};
