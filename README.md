### Adv-Big-Data-Indexing
# For Demo 1
Rest API that can handle any structured data in Json
Specify URIs, status codes, headers, data model, version
Rest API with support for crd operations
Post, Get, Delete
Rest API with support for validation
◦Json Schema describing the data model for the use case
Controller validates incoming payloads against json schema
The semantics with ReST API operations such as update if not changed/read if changed
Update not required
Conditional read is required
Storage of data in key/value store
Must implement use case provided

# Demo 2 Final Done 
for reddit  redis-cli KEYS "*" | grep -v "^sess:" | grep -v "^forgot-password:"

These are the requirements for the second demo:

Rest API that can handle any structured data in Json
Rest API with support for crud operations, including merge/Patch support,  delete
Rest API with support for validation
Json Schema describing the data model for the use case
Advanced semantics with rest API operations such as update if not changed; conditional read and conditional write
Storage of data in key/value store
Security mechanism must use RS 256 (use google idp if possible. you may generate your own token)

 

Crux - 412 in case the value does not match (Etag with Generated Etag there in Patch and Put) Use If-Match for Patch and Put. Make sure the token is passed in Authorization.
