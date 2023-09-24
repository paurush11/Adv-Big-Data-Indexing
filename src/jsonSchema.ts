const jsonSchema = {
  $schema: "http://json-schema.org/draft-04/schema#",
  title: "JSON Schema",
  description: "JSON Schema for the Use Case",
  type: "object",
  properties: {
    planCostShares: {
      type: "object",
      properties: {
        deductible: {
          type: "number",
        },
        _org: {
          type: "string",
        },
        copay: {
          type: "number",
        },
        objectId: {
          type: "string",
        },
        objectType: {
          type: "string",
        },
      },
    },
    linkedPlanServices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          linkedService: {
            type: "object",
            properties: {
              _org: {
                type: "string",
              },
              objectId: {
                type: "string",
              },
              objectType: {
                type: "string",
              },
              name: {
                type: "string",
              },
            },
          },
          planserviceCostShares: {
            type: "object",
            properties: {
              deductible: {
                type: "number",
              },
              _org: {
                type: "string",
              },
              copay: {
                type: "number",
              },
              objectId: {
                type: "string",
              },
              objectType: {
                type: "string",
              },
            },
          },
          _org: {
            type: "string",
          },
          objectId: {
            type: "string",
          },
          objectType: {
            type: "string",
          },
        },
      },
    },
    _org: {
      type: "string",
    },
    objectId: {
      type: "string",
    },
    objectType: {
      type: "string",
    },
    planType: {
      type: "string",
    },
    creationDate: {
      type: "string",
    },
  },
  additionalProperties: false,
};

const schemaWithDefinitions = {
  $schema: "http://json-schema.org/draft-04/schema#",
  title: "JSON Schema",
  description: "JSON Schema for the Use Case",
  type: "object",
  properties: {
    planCostShares: { $ref: "#/definitions/planCostShare" },
    linkedPlanServices: {
      type: "array",
      items: { $ref: "#/definitions/linkedPlanService" },
    },
    _org: { type: "string" },
    objectId: { type: "string" },
    objectType: { type: "string" },
    planType: { type: "string" },
    creationDate: { type: "string" },
  },
  additionalProperties: false,
  definitions: {
    planCostShare: {
      type: "object",
      properties: {
        deductible: { type: "number" },
        _org: { type: "string" },
        copay: { type: "number" },
        objectId: { type: "string" },
        objectType: { type: "string" },
      },
    },
    linkedPlanService: {
      type: "object",
      properties: {
        linkedService: { $ref: "#/definitions/service" },
        planserviceCostShares: { $ref: "#/definitions/planCostShare" },
        _org: { type: "string" },
        objectId: { type: "string" },
        objectType: { type: "string" },
      },
    },
    service: {
      type: "object",
      properties: {
        _org: { type: "string" },
        objectId: { type: "string" },
        objectType: { type: "string" },
        name: { type: "string" },
      },
    },
  },
};

export default { jsonSchema, schemaWithDefinitions };
