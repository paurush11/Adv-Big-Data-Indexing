import { returnBodyResponse } from "./apiLogicForCRUD";
import { getMapping } from "./elasticSearch";

const getMappingFromEs = async (esClient: any) => {
  try {
    const response = await getMapping(esClient);
    return returnBodyResponse(false, 200, response);
  } catch (error) {
    return returnBodyResponse(true, 200, error);
  }
};
///Write more such queries

// # Click the Variables button, above, to create your own variables.
// GET ${exampleVariable1} // _search
// {
//   "query": {
//     "${exampleVariable2}": {} // match_all
//   }
// }

// GET _search
// {
//   "query": {
//     "match_all": {}
//   }
// }

// GET /plans/_mapping
// DELETE /plans

// GET /plans/_search
// {
//   "query":{
//     "bool":{
//         "must":{
//         "match_phrase":{
//           "creationDate":"12-12-2000"
//         }
//       }
//     }
//   }
// }
// GET /plans/_search
// {
//   "query":{
//     "bool":{
//         "must":{
//         "match_phrase":{
//            "_id": "plan_12xvxc345ssdsds"
//         }
//       }
//     }
//   }
// }
// GET /plans/_search
// {
//   "query":{
//     "bool":{
//         "must":{
//         "match":{
//           "_routing":"planservice_27283xvx9asdff"
//         }
//       }
//     }
//   }
// }

// GET /plans/_search
// {
//   "query": {
//     "has_child": {
//       "type": "planservice_service",
//       "query": {
//         "bool": {
//           "must": [
//             {
//               "match": {
//                "name": "Yearly physical the old stuff"
//               }
//             }
//           ]
//         }
//       }
//     }
//   }
// }

// GET /plans/_search
// {
//   "query":{
//     "has_child":{
//       "type": "plan_membercostshare",
//       "query": {
//         "bool":{
//           "must": [
//             {"match": {
//                "copay": 10
//             }}
//           ]
//         }
//       }
//     }
//   }
// }
// GET /plans/_search
// {
//   "query":{
//     "has_child":{
//       "type": "planservice_membercostshare",
//       "query": {
//         "bool":{
//           "must":{
//             "match_phrase":{
//               "copay":178
//             }
//           }
//         }
//       }
//     }
//   }
// }
// ///Failed Query
// GET /plans/_search
// {
//   "query":{
//     "has_parent": {
//       "parent_type": "plan",
//       "query": {
//           "bool":{
//             "must":[
//               {
//                 "match":{
//                 "objectId":175
//               }
//             }
//           ]
//         }
//       }
//     }
//   }
// }
// ///Failed Query
// GET /plans/_search
// {
//   "query":{
//     "has_parent": {
//       "parent_type": "planserviceCostShares",
//       "query": {
//           "bool":{
//             "must":[
//               {
//                 "match":{
//                 "objectId":"linkedPlanServices"
//               }
//             }
//           ]
//         }
//       }
//     }
//   }
// }

// GET /plans/_search
// {
//   "query":{
//     "has_child":{
//       "type": "linkedPlanServices",
//       "query": {
//         "bool":{
//           "must":{
//             "match_phrase":{
//               "linkedService.name":"Yearly physical one two three"
//             }
//           }
//         }
//       }
//     }
//   }
// }

// app.get(
//     "/allChildrenHavingCopayLessOrGreater",
//     verifyHeaderToken,
//     async (req, res) => {
//       try {
//         const fields = req.query;
//         let lessQ = false;
//         if (fields.lt === "true") {
//           console.log(fields);
//           lessQ = true;
//         }
//         const query = lessQ
//           ? {
//               query: {
//                 has_child: {
//                   type: "planCostShares", // Replace with the correct child type name
//                   query: {
//                     range: {
//                       copay: {
//                         lt: fields.copay,
//                       },
//                     },
//                   },
//                 },
//               },
//             }
//           : {
//               query: {
//                 has_child: {
//                   type: "planCostShares", // Replace with the correct child type name
//                   query: {
//                     range: {
//                       copay: {
//                         gt: fields.copay,
//                       },
//                     },
//                   },
//                 },
//               },
//             };

//         const body = await esClient.search({
//           index: "plans", // Replace with your index name
//           body: query,
//         });
//         const allPlans: any = [];
//         body.hits.hits.forEach((element: any) => {
//           allPlans.push(element._source);
//         });

//         const promises = allPlans.map((val: any) => {
//           return (async () => {
//             return await reconstructObject(val, redisClient, esClient);
//           })();
//         });
//         const allPlansRestructured = await Promise.all(promises);
//         return res.status(200).send(allPlansRestructured);
//       } catch (error) {
//         console.error("Error fetching documents:", error);
//         res.status(500).send("Error fetching documents");
//       }
//     },
//   );
//   app.get("/allParentsHaving", verifyHeaderToken, async (req, res) => {
//     try {
//       const fields = req.query;
//       const query = {
//         query: {
//           has_child: {
//             type: fields.type, // Replace with the correct child type name
//             query: {
//               bool: {
//                 must: [] as any,
//               },
//             },
//           },
//         },
//       };

//       for (const [keys, vals] of Object.entries(fields)) {
//         if (keys === "type") {
//           continue;
//         } else {
//           query.query.has_child.query.bool.must.push({
//             match_phrase: { [keys]: vals },
//           });
//         }
//       }
//       const body = await esClient.search({
//         index: "plans", // Replace with your index name
//         body: query,
//       });
//       const totalNoOfPlans = body.hits.total.value;
//       const allPlans: any = [];
//       body.hits.hits.forEach((element: any) => {
//         allPlans.push(element._source);
//       });

//       const promises = allPlans.map((val: any) => {
//         return (async () => {
//           return await reconstructObject(val, redisClient, esClient);
//         })();
//       });
//       const allPlansRestructured = await Promise.all(promises);
//       // console.log(allPlansRestructured);

//       // console.log(body.hits.total.value)
//       return res.status(200).send(allPlansRestructured);
//     } catch (error) {
//       console.error("Error fetching documents:", error);
//       res.status(500).send("Error fetching documents");
//     }
//   });
// app.get("/search/plans", verifyHeaderToken, async (req, res) => {
//     try {
//       const searchCriteria = req.query;
//       console.log(searchCriteria);

//       if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
//         return res.status(400).send("Search criteria are required");
//       }
//       let query = {
//         bool: {
//           must: [] as any,
//         },
//       };
//       // Build the query from the search criteria
//       // Example criteria: { "planType": "inNetwork", "creationDate": "12-12-3000" }
//       for (const [field, value] of Object.entries(searchCriteria)) {
//         query.bool.must.push({ match_phrase: { [field]: value } });
//       }

//       const searchResult = await esClient.search({
//         index: "plans", // Ensure this matches your index name
//         body: {
//           query,
//         },
//       });
//       console.log(query.bool.must);
//       return res.status(200).json(searchResult.hits.hits);
//     } catch (error) {
//       console.error("Error during search", error);
//       return res.status(500).send("Internal Server Error");
//     }
//   });

export { getMappingFromEs };
