import 'dotenv/config';
import express from "express";


const main = async () => {
  const app = express();
  app.listen(4000, () => {
    console.log("using server, ", process.env.PORT);
  });
};

main().catch((e) => {
  console.log("Error -", e);
});
