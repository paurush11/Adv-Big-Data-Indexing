import { isValidDate } from "./dateValidator";
import {
  ObjectExists,
  deleteObject,
  generateRelationshipsStart,
  reconstructObject,
  saveObjectRecursive,
} from "./elasticSearch";
import { fetchAccessToken, generateEtag } from "./jwtAuth";
import Redis from "ioredis";
import { sendESRequest } from "./rabbitMq";
import { modifyObject } from "./modifyObject";
import { mainObject } from "./types";

const { Validator } = require("jsonschema");

const checkIfObjectExistsNow = async (
  fetchSavedObject: any,
  esClient: any,
  planBody: any,
  statusCode: any,
  generatedEtag: string,
): Promise<{
  response: {
    isError: boolean;
    status: number;
    body: any;
    eTag: string | undefined;
  };
}> => {
  const result = await ObjectExists(
    fetchSavedObject.objectType + "_" + fetchSavedObject.objectId,
    esClient,
    fetchSavedObject,
  );
  console.log("Checking if object exists...");
  if (result) {
    console.log("Object found:", result);
    console.log("Continuing with relationship generation...");
    await generateRelationshipsStart(planBody, esClient);
    return returnBodyResponse(
      false,
      statusCode,
      "Object Successfully Saved",
      generatedEtag,
    );
  } else {
    console.log("Object not found, retrying...");
    await new Promise((resolve) => setTimeout(resolve, 200));
    return checkIfObjectExistsNow(
      fetchSavedObject,
      esClient,
      planBody,
      statusCode,
      generatedEtag,
    );
  }
};
const getPlan = async (
  key: string,
  redisClient: Redis,
  esClient: any,
  clientEtag?: string,
) => {
  const obj = await fetchObjectFromRedis(key, redisClient);
  if (obj === "No Such Object Exists") {
    return returnBodyResponse(true, 404, "No such Object Exists");
  }
  const mainObject = JSON.parse(obj);
  const reconstructedMainObject = await reconstructObject(
    mainObject,
    redisClient,
    esClient,
  );
  const generatedEtag = generateEtag(JSON.stringify(reconstructedMainObject));
  if (clientEtag && clientEtag === generatedEtag) {
    return returnBodyResponse(false, 304, "No changes", generatedEtag);
  }
  return returnBodyResponse(false, 200, reconstructedMainObject, generatedEtag);
};

const postPlan = async (
  key: string,
  redisClient: Redis,
  esClient: any,
  planBody: any,
) => {
  console.log("Adding a plan to the redis client");
  const schema = await fetchObjectFromRedis("schema", redisClient);
  if (schema === "No Such Object Exists") {
    return returnBodyResponse(true, 404, "No such Object Exists");
  }
  const objectID: string =
    planBody.objectId !== undefined ? planBody.objectId : null;

  if (!objectID || key !== planBody.objectType + "_" + objectID) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Object! Does not match the Schema provided",
    );
  }

  const checkIfObjectExists = await checkObjectExists(
    planBody.objectType + "_" + objectID,
    redisClient,
  );
  if (checkIfObjectExists) {
    return returnBodyResponse(true, 409, "Object Already Exists");
  }

  const validator = new Validator();
  const result = validator.validate(planBody, JSON.parse(schema as string));
  if (!result.valid) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Object! Does not match the Schema provided",
    );
  }

  const creationDateValid = isValidDate(planBody.creationDate);
  if (!creationDateValid) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format",
    );
  }
  try {
    const fetchSavedObject = await saveObjectRecursive(planBody, redisClient);
    const generatedEtag = generateEtag(JSON.stringify(planBody));
    await sendESRequest(fetchSavedObject, "POST");
    return await checkIfObjectExistsNow(
      fetchSavedObject,
      esClient,
      planBody,
      201,
      generatedEtag,
    );
  } catch (e) {
    return returnBodyResponse(true, 500, "Error in saving object");
  }
};

const putPlan = async (
  key: string,
  redisClient: Redis,
  esClient: any,
  planBody: any,
  clientEtag?: string,
) => {
  console.log("Putting a plan to the redis client");
  const schema = await fetchObjectFromRedis("schema", redisClient);
  if (schema === "No Such Object Exists") {
    return returnBodyResponse(true, 404, "No such Object Exists");
  }
  const objectID: string =
    planBody.objectId !== undefined ? planBody.objectId : null;
  if (!objectID || key !== planBody.objectType + "_" + objectID) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Object! Does not match the Schema provided",
    );
  }

  const checkIfObjectExists = await fetchObjectFromRedis(
    planBody.objectType + "_" + objectID,
    redisClient,
  );
  if (checkIfObjectExists === "No Such Object Exists") {
    return returnBodyResponse(
      true,
      409,
      "Object does not Exist, consider using a Post Operation",
    );
  }

  const reconstructedOldObject = await reconstructObject(
    JSON.parse(checkIfObjectExists),
    redisClient,
    esClient,
  );
  let generatedEtag = generateEtag(JSON.stringify(reconstructedOldObject));
  if (clientEtag && clientEtag !== generatedEtag) {
    return returnBodyResponse(true, 412, "Precondition failed");
  }
  const validator = new Validator();
  const result = validator.validate(planBody, JSON.parse(schema as string));
  if (!result.valid) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Object! Does not match the Schema provided",
    );
  }

  const creationDateValid = isValidDate(planBody.creationDate);
  if (!creationDateValid) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format",
    );
  }
  try {
    const fetchSavedObject = await saveObjectRecursive(planBody, redisClient);
    generatedEtag = generateEtag(JSON.stringify(planBody));
    await sendESRequest(fetchSavedObject, "PUT");
    return await checkIfObjectExistsNow(
      fetchSavedObject,
      esClient,
      planBody,
      200,
      generatedEtag,
    );
  } catch (e) {
    return returnBodyResponse(true, 500, "Error in saving object");
  }
};

const patchPlan = async (
  key: string,
  redisClient: Redis,
  esClient: any,
  planBody: any,
  clientEtag?: string,
) => {
  console.log("Patching a plan to the redis client");
  const schema = await fetchObjectFromRedis("schema", redisClient);
  if (schema === "No Such Object Exists") {
    return returnBodyResponse(true, 404, "No such Object Exists");
  }
  const objectID = key;
  if (!objectID) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Object! Does not match the Schema provided",
    );
  }

  const checkIfObjectExists = await fetchObjectFromRedis(objectID, redisClient);
  if (checkIfObjectExists === "No Such Object Exists") {
    return returnBodyResponse(
      true,
      409,
      "Object does not Exist, consider using a Post Operation",
    );
  }

  const reconstructedOldObject = await reconstructObject(
    JSON.parse(checkIfObjectExists),
    redisClient,
    esClient,
  );
  const updatedObject = modifyObject(reconstructedOldObject, planBody);
  if (
    updatedObject &&
    typeof updatedObject === "string" &&
    updatedObject === "Wrong Object Type"
  ) {
    return returnBodyResponse(
      true,
      400,
      "Wrong Object Type Entered, Must be within the scope of the Schema",
    );
  }
  let generatedEtag = generateEtag(JSON.stringify(reconstructedOldObject));
  if (clientEtag && clientEtag !== generatedEtag) {
    return returnBodyResponse(true, 412, "Precondition failed");
  }
  const validator = new Validator();
  const result = validator.validate(
    updatedObject,
    JSON.parse(schema as string),
  );
  if (!result.valid) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Object! Does not match the Schema provided",
    );
  }
  const creationDateValid = isValidDate(
    (updatedObject as mainObject).creationDate,
  );
  if (!creationDateValid) {
    return returnBodyResponse(
      true,
      400,
      "Invalid Date Object! Date not match the Schema provided. Make sure its DD-MM-YYYY format",
    );
  }
  try {
    const fetchSavedObject = await saveObjectRecursive(
      updatedObject,
      redisClient,
    );
    generatedEtag = generateEtag(JSON.stringify(updatedObject));
    await sendESRequest(fetchSavedObject, "PATCH");
    return await checkIfObjectExistsNow(
      fetchSavedObject,
      esClient,
      updatedObject,
      200,
      generatedEtag,
    );
  } catch (e) {
    return returnBodyResponse(true, 500, "Error in saving object");
  }
};

const deletePlan = async (key: string, redisClient: Redis, esClient: any) => {
  const obj = await fetchObjectFromRedis(key, redisClient);
  if (obj === "No Such Object Exists") {
    return returnStringResponse(true, 404, "No such Object Exists");
  }
  try {
    await deleteObject(key, redisClient, esClient);
    return returnStringResponse(false, 200, "Plan successfully deleted.");
  } catch (e) {
    return returnStringResponse(true, 500, "Error deleting plan.");
  }
};

const returnStringResponse = (
  hasError: boolean,
  statusCode: number,
  message: string,
) => {
  return {
    response: {
      isError: hasError,
      status: statusCode,
      message: message,
    },
  };
};
const returnBodyResponse = (
  hasError: boolean,
  statusCode: number,
  body: any,
  etag?: string,
) => {
  return {
    response: {
      isError: hasError,
      status: statusCode,
      body: body,
      eTag: etag,
    },
  };
};
const checkObjectExists = async (key: any, redisClient: Redis) => {
  const data = await redisClient.exists(key);
  return data;
};
const fetchObjectFromRedis = async (key: any, redisClient: Redis) => {
  const obj = await redisClient.get(key);
  return obj ? obj : "No Such Object Exists";
};
const deleteValueInRedis = async (
  key: any,
  redisClient: Redis,
  callBack: (
    hasError: boolean,
    statusCode: number,
    message: string,
  ) => {
    response: {
      isError: boolean;
      status: number;
      message: string;
    };
  },
) => {
  const exists = await checkObjectExists(key, redisClient);
  if (!exists) {
    return callBack(true, 500, "No such value to delete");
  }
  try {
    await redisClient.del(key);
    return callBack(false, 200, "Schema is deleted");
  } catch (e) {
    return callBack(true, 500, "Error in deleting Schema");
  }
};
const setValueInRedis = async (
  key: any,
  value: any,
  redisClient: Redis,
  callBack: (
    hasError: boolean,
    statusCode: number,
    message: string,
  ) => {
    response: {
      isError: boolean;
      status: number;
      message: string;
    };
  },
) => {
  const data = await checkObjectExists(key, redisClient);
  if (data) {
    return callBack(true, 409, "Schema Already Exists");
  }
  try {
    await redisClient.set(key, JSON.stringify(value));
    return callBack(false, 200, "The Schema is Added");
  } catch (e) {
    return callBack(true, 500, "Error in adding Schema");
  }
};
const postSchema = async (schema: any, redisClient: Redis) => {
  console.log("Adding Json Schema to the redis client");
  return await setValueInRedis(
    "schema",
    schema,
    redisClient,
    returnStringResponse,
  );
};
const deleteSchema = async (key: string, redisClient: Redis) => {
  console.log("Deleting Json Schema to the redis client");
  return await deleteValueInRedis(key, redisClient, returnStringResponse);
};
const getToken = async () => {
  try {
    const response = await fetchAccessToken();
    const { access_token, expires_in, token_type } = response;
    return {
      response: {
        access_token,
        expires_in,
        token_type,
      },
    };
  } catch (e) {
    console.log(e);
    return {
      error: {
        message: e,
        status: e.response.status,
      },
    };
  }
};

export {
  getToken,
  postSchema,
  deleteSchema,
  getPlan,
  deletePlan,
  checkIfObjectExistsNow,
  postPlan,
  putPlan,
  patchPlan,
  returnBodyResponse,
};
