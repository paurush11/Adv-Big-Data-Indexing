import amqp from "amqplib";

import * as crypto from "crypto";

const sendESRequest = async (
  fetchSavedObject: any,

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
const saveESItems = async (msg: string, esClient: any) => {
  try {
    const message = JSON.parse(msg);
    const type = message.type;
    if (type === "insert") {
      return await esClient.index({
        index: "plans",
        id: message.id,
        body: message.body,
      });
    } else {
      return await esClient.update({
        index: "plans",
        id: message.id,
        body: {
          doc: message.body,
        },
      });
    }
  } catch (e) {
    console.error(e);
    return "not Done";
  }
};

const receiveMessage = async (queue: string, esClient: any, callBack: any) => {
  const { connection, channel } = await rabbitMqConnection();
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

        callBack(JSON.stringify(newMessage), esClient);
        channel.ack(msg);
      }
    },
    { noAck: false },
  );
};

export {
  generateCorrelationId,
  sendMessage,
  sendESRequest,
  saveESItems,
  receiveMessage,
};
