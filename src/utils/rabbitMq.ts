import amqp from "amqplib";

import * as crypto from "crypto";

const sendESRequest = async (
  fetchSavedObject: Object | String,
  type: string,
) => {
  /// send message to ES to save this.
  let message = {
    doc: fetchSavedObject,
    type: "insert",
  };
  if (type === "POST") {
    await sendMessage(JSON.stringify(message));
  } else if (type === "PATCH" || type === "PUT") {
    message.type = "update";
    await sendMessage(JSON.stringify(message));
  } else {
    message.type = "delete";
    await sendMessage(JSON.stringify(message));
  }
};
const rabbitMqConnection = async () => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL || "");
  const channel = await connection.createChannel();
  const requestQueue = "requestQueue";
  return {
    connection,
    channel,
    requestQueue,
  };
};
const generateCorrelationId = (planBody: any) => {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(planBody))
    .digest("hex");
};
const sendMessage = async (message: string) => {
  const { connection, channel, requestQueue } = await rabbitMqConnection();
  await channel.assertQueue(requestQueue, { durable: false });
  console.log("message Sent");
  channel.sendToQueue(requestQueue, Buffer.from(message));
  setTimeout(() => {
    connection.close();
  }, 500);
};
const OperateObjectInES = async (esClient: any, value: any, type: string) => {
  if (type === "delete") {
    await esClient.delete({
      index: "plans",
      id: value.objectType + "_" + value.objectId,
    });
  } else {
    await esClient.index({
      index: "plans",
      id: value.objectType + "_" + value.objectId,
      body: value,
    });
  }
};
const saveESRecursive = async (
  healthMessageJSON: any,
  esClient: any,
  type: string,
) => {
  const savedObject = {} as any;
  for (const [key, value] of Object.entries(healthMessageJSON)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        savedObject[key] = [];
        const promises = value.map((val) => {
          return (async () => {
            saveESRecursive(val, esClient, type);
            return val;
          })();
        });
        savedObject[key] = await Promise.all(promises);
      } else {
        saveESRecursive(value, esClient, type);
        savedObject[key] = healthMessageJSON;
      }
    } else {
      savedObject.key = value;
    }
  }
  await OperateObjectInES(esClient, healthMessageJSON, type);
  return savedObject;
};
const saveESItems = async (msg: string, esClient: any) => {
  try {
    const message = JSON.parse(msg);
    const type = message.type;
    await saveESRecursive(message.body, esClient, type);
  } catch (e) {
    console.error(e);
    return "not Done";
  }
};
const receiveMessage = async (queue: string, esClient: any, callBack: any) => {
  const { channel } = await rabbitMqConnection();
  await channel.assertQueue(queue, { durable: false });
  console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);
  channel.consume(
    queue,
    (msg) => {
      if (msg) {
        const message = JSON.parse(msg.content.toString());
        const newMessage = {
          index: "plans",
          id: message.doc.objectId,
          body: message.doc,
          type: message.type,
        };
        try{
          callBack(JSON.stringify(newMessage), esClient);
          channel.ack(msg);
        }catch(e){
          console.error(e)
          return "Error in processing ";
        }
      }
    },
    { noAck: false },
  );
};

export {
  generateCorrelationId,
  receiveMessage,
  saveESItems,
  sendESRequest,
  sendMessage,
};
