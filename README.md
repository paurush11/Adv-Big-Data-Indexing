### Adv-Big-Data-Indexing
# For Demo 1

 - Rest API that can handle any structured data in Json.
 - Specify URIs, status codes, headers, data model, version.
 - Rest API with support for crd operations.
 - Post, Get, Delete.
 - Rest API with support for validation
 - Json Schema describing the data model for the use case
 - Controller validates incoming payloads against json schema
 - The semantics with ReST API operations such as update if not changed/read if changed
 - Update not required
 - Conditional read is required
 - Storage of data in key/value store
 - Must implement use case provided

# Demo 2 Final Done 
**For reddit  `redis-cli KEYS "*" | grep -v "^sess:" | grep -v "^forgot-password:"`**

These are the requirements for the second demo:

 - Rest API that can handle any structured data in Json
 - Rest API with support for crud operations, including merge/Patch support,  delete
 - Rest API with support for validation
 - Json Schema describing the data model for the use case
 - Advanced semantics with rest API operations such as update if not changed; conditional read and conditional write
 - Storage of data in key/value store
 - Security mechanism must use RS 256 (use google idp if possible. you may generate your own token)


> Crux - 412 in case the value does not match (Etag with Generated Etag
> there in Patch and Put) Use If-Match for Patch and Put. Make sure the
> token is passed in Authorization.



# Demo 3 Final Done 

**Updates**
 - **Previous approach -->**
	 - Save the entire object in redis by stringifying it and then later on making any changes to it.

This approach is considered to be wrong.
Why?
 - 1 - If we have a 1000 documents and we need to make change in
   planCostShare of a single document we will have to make 1000 changes
 -	2 - We cannot index the documents since they do not have a parent
   child relationship

**Solution** 
1. Generate Mappings for elastic search
2. Save Objects in redis and Es Search only on the reference basis
3. For parent child relationships, we should make sure that one child only belongs to one parent 
4. When we fetch the child, Make sure that Etag is generated on the complete object and not on the reference object
5. This is done so that in patch request we can find the old objects and generate the Etag value and then later on compare it with the new Etag value, (in if-Match)   then only we are allowed to make any patch changes, same flow with put changes
6. We save the object as reference in both redis and es search and then fetch them based on their Id's .
7. Then we make sure that We generate relationships (Parent child and GrandChildren) based on that
8. Once that is done This completes our requirement, and we can finally send the restructured document in the response
9. If No value is found in Es Search we can send 404, based on No of Hits


## PostMan Requests

 1. https://localhost:9200
	
	 - Useful to test the connection
	 - Authorization fields would require you to have a ES_Username and Password, configure it in postman 	
	 - Also add ans ssl cert to your location  eg - bigdataIndexingProject/cert
 2. localhost:5005/search/plans?creationDate=12-12-2000
	 - This Api is used to search all fields and this requires you to have a match_phrase meaning only the exact same thing will be matched.
	 - The things that can be searched are 
		 - "_org":  "example.com",
		 - "objectId":  "12xvxc345ssdsds",
		 - "objectType":  "plan",
		 - "planType":  "inNetwork3",
		 - "creationDate":  "12-12-2000"
	- planCostShares and linkedPlanServices are children so they wont be affected in this api
 3. localhost:5005/allResults?index=plans
	 - This Api will give everything in our Index Plan
 4. localhost:5005/allChildrenHavingCopayLessOrGreater?copay=-1
	 - This api will give parent having  planCostShares.copay value less than or equal to -1 or greater than or equal to -1 it all depends on the parameter
	 - the param lt is defined and it can be either true or false or null
 5. localhost:5005/allParentsHaving?linkedService.name=Yearly physical    &type=linkedPlanServices 
	 - planCostShares and linkedPlanServices will be checked here
	 - all the props in the child can se searched and we have to mention the type here 
 6. localhost:5005/getMapping
	 - This gives the mapping
	 - Importnant part

   
> Run the runcommand in mainfx before anything



Rabbit MQ is set up, now I will save the main object in esSearch, so when I do that then I will send the message to rabbit Mq server, and then try to see if the object is present in es search. As soon as I get the result, I will cancel the interval ( that was set up for every 200ms) and then generate the relationships.
The type of message that is sent is stringified and then the type and message contains if its index or a update request.


That concludes the end of this project.

त्रिविधं नरकस्येदं द्वारं नाशनमात्मन: |
काम: क्रोधस्तथा लोभस्तस्मादेतत्त्रयं त्यजेत् ||  

_____________

## Version 2 

### Requirements

 1. Id is corrected  - ObjectType_ObjectID --- Done
 2. ES should only be done by RabbitMQ --- Done
 3. Correct way of authenticating should be done with OAuth or google passport  --- To be done
 4. All JSON data should be processed, with ObjectType and ObjectID as the required fields --- Depend on the schema
 5. Parent child Relationships should be based off of schema and not manual work --- Depend on the schema

### Updates
1. Learned that Redis is Authoritative in nature (meaning that I just need to store all of my data in redis and not actually wait for ES search to save data, as soon as data is sent to queue just send a response that data has been saved, later on if the data in queue is dequeued, save it in a separate queue that will only dequeue if the data has been stored correctly, if not keep on repeating the process and not let the user know about this but the backend team should know about this.)
2. Also, Delete as a Crud Operation should Involve Es Search delete done by Rabbit Mq


