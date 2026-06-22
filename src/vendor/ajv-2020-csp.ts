type JsonSchemaType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

export type CspAjvError = {
  instancePath: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
  schemaPath?: string;
};

export type CspValidateFunction = ((data: unknown) => boolean) & {
  errors?: CspAjvError[] | null;
};

const VALID_TYPES = new Set<JsonSchemaType>([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pushError(
  errors: CspAjvError[],
  instancePath: string,
  keyword: string,
  message: string,
  params: Record<string, unknown> = {},
): void {
  errors.push({ instancePath, keyword, message, params });
}

function isJsonSchema(schema: unknown): schema is boolean | Record<string, unknown> {
  return typeof schema === 'boolean' || isRecord(schema);
}

function getSchemaTypes(schemaType: unknown): JsonSchemaType[] | undefined {
  if (schemaType === undefined) return undefined;
  if (typeof schemaType === 'string' && VALID_TYPES.has(schemaType as JsonSchemaType)) {
    return [schemaType as JsonSchemaType];
  }
  if (
    Array.isArray(schemaType)
    && schemaType.every((type) => typeof type === 'string' && VALID_TYPES.has(type as JsonSchemaType))
  ) {
    return schemaType as JsonSchemaType[];
  }
  return undefined;
}

function typeMatches(data: unknown, type: JsonSchemaType): boolean {
  switch (type) {
    case 'array':
      return Array.isArray(data);
    case 'boolean':
      return typeof data === 'boolean';
    case 'integer':
      return typeof data === 'number' && Number.isFinite(data) && Number.isInteger(data);
    case 'null':
      return data === null;
    case 'number':
      return typeof data === 'number' && Number.isFinite(data);
    case 'object':
      return isRecord(data);
    case 'string':
      return typeof data === 'string';
  }
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
  }
  return false;
}

function validateSchemaObject(schema: unknown, path: string, errors: CspAjvError[]): boolean {
  if (typeof schema === 'boolean') return true;
  if (!isRecord(schema)) {
    pushError(errors, path, 'type', 'must be object or boolean schema', { type: 'object' });
    return false;
  }

  const schemaType = schema.type;
  if (schemaType !== undefined && getSchemaTypes(schemaType) === undefined) {
    pushError(errors, `${path}/type`, 'type', 'must be a valid JSON Schema type or type array', { type: 'string' });
  }

  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    pushError(errors, `${path}/enum`, 'type', 'must be array', { type: 'array' });
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || !schema.required.every((item) => typeof item === 'string')) {
      pushError(errors, `${path}/required`, 'type', 'must be array of strings', { type: 'array' });
    }
  }

  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      pushError(errors, `${path}/properties`, 'type', 'must be object', { type: 'object' });
    } else {
      for (const [property, propertySchema] of Object.entries(schema.properties)) {
        validateSchemaObject(propertySchema, `${path}/properties/${escapeJsonPointer(property)}`, errors);
      }
    }
  }

  const additionalProperties = schema.additionalProperties;
  if (additionalProperties !== undefined && !isJsonSchema(additionalProperties)) {
    pushError(errors, `${path}/additionalProperties`, 'type', 'must be boolean or object schema', {});
  } else if (isRecord(additionalProperties)) {
    validateSchemaObject(additionalProperties, `${path}/additionalProperties`, errors);
  }

  if (schema.items !== undefined) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach((itemSchema, index) => validateSchemaObject(itemSchema, `${path}/items/${index}`, errors));
    } else {
      validateSchemaObject(schema.items, `${path}/items`, errors);
    }
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const value = schema[keyword];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.length === 0) {
      pushError(errors, `${path}/${keyword}`, 'type', 'must be non-empty array', { type: 'array' });
    } else {
      value.forEach((itemSchema, index) => validateSchemaObject(itemSchema, `${path}/${keyword}/${index}`, errors));
    }
  }

  if (schema.not !== undefined) {
    validateSchemaObject(schema.not, `${path}/not`, errors);
  }

  for (const keyword of ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems'] as const) {
    if (schema[keyword] !== undefined && typeof schema[keyword] !== 'number') {
      pushError(errors, `${path}/${keyword}`, 'type', 'must be number', { type: 'number' });
    }
  }

  if (schema.pattern !== undefined && typeof schema.pattern !== 'string') {
    pushError(errors, `${path}/pattern`, 'type', 'must be string', { type: 'string' });
  } else if (typeof schema.pattern === 'string') {
    try {
      new RegExp(schema.pattern, 'u');
    } catch {
      pushError(errors, `${path}/pattern`, 'pattern', 'must be a valid regular expression', {});
    }
  }

  return errors.length === 0;
}

function validateData(schema: unknown, data: unknown, path: string, errors: CspAjvError[]): boolean {
  if (schema === true) return true;
  if (schema === false) {
    pushError(errors, path, 'false schema', 'boolean schema is false');
    return false;
  }
  if (!isRecord(schema)) {
    pushError(errors, path, 'schema', 'schema must be object or boolean');
    return false;
  }

  const constValue = schema.const;
  if (schema.const !== undefined && !deepEqual(data, constValue)) {
    pushError(errors, path, 'const', 'must be equal to constant', { allowedValue: constValue });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((value) => deepEqual(data, value))) {
    pushError(errors, path, 'enum', 'must be equal to one of the allowed values', { allowedValues: schema.enum });
  }

  const types = getSchemaTypes(schema.type);
  if (types && !types.some((type) => typeMatches(data, type))) {
    pushError(errors, path, 'type', `must be ${types.join(',')}`, { type: types.length === 1 ? types[0] : types });
    return false;
  }

  if (Array.isArray(schema.allOf)) {
    for (const itemSchema of schema.allOf) {
      validateData(itemSchema, data, path, errors);
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const valid = schema.anyOf.some((itemSchema) => validateData(itemSchema, data, path, []) === true);
    if (!valid) pushError(errors, path, 'anyOf', 'must match a schema in anyOf');
  }

  if (Array.isArray(schema.oneOf)) {
    const validCount = schema.oneOf.filter((itemSchema) => validateData(itemSchema, data, path, []) === true).length;
    if (validCount !== 1) pushError(errors, path, 'oneOf', 'must match exactly one schema in oneOf', { passingSchemas: validCount });
  }

  if (schema.not !== undefined && validateData(schema.not, data, path, []) === true) {
    pushError(errors, path, 'not', 'must NOT be valid');
  }

  validateObjectKeywords(schema, data, path, errors);
  validateStringKeywords(schema, data, path, errors);
  validateNumberKeywords(schema, data, path, errors);
  validateArrayKeywords(schema, data, path, errors);

  return errors.length === 0;
}

function validateObjectKeywords(schema: Record<string, unknown>, data: unknown, path: string, errors: CspAjvError[]): void {
  if (!isRecord(data)) return;

  const properties = isRecord(schema.properties) ? schema.properties : {};

  if (Array.isArray(schema.required)) {
    for (const property of schema.required) {
      if (typeof property === 'string' && data[property] === undefined) {
        pushError(errors, path, 'required', `must have required property '${property}'`, { missingProperty: property });
      }
    }
  }

  for (const [property, propertySchema] of Object.entries(properties)) {
    if (data[property] !== undefined) {
      validateData(propertySchema, data[property], `${path}/${escapeJsonPointer(property)}`, errors);
    }
  }

  const additionalProperties = schema.additionalProperties;
  if (additionalProperties === undefined || additionalProperties === true) return;

  for (const property of Object.keys(data)) {
    if (Object.prototype.hasOwnProperty.call(properties, property)) continue;
    if (additionalProperties === false) {
      pushError(errors, path, 'additionalProperties', 'must NOT have additional properties', { additionalProperty: property });
    } else {
      validateData(additionalProperties, data[property], `${path}/${escapeJsonPointer(property)}`, errors);
    }
  }
}

function validateStringKeywords(schema: Record<string, unknown>, data: unknown, path: string, errors: CspAjvError[]): void {
  if (typeof data !== 'string') return;

  if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
    pushError(errors, path, 'minLength', `must NOT have fewer than ${schema.minLength} characters`, { limit: schema.minLength });
  }
  if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
    pushError(errors, path, 'maxLength', `must NOT have more than ${schema.maxLength} characters`, { limit: schema.maxLength });
  }
  if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(data)) {
    pushError(errors, path, 'pattern', `must match pattern "${schema.pattern}"`, { pattern: schema.pattern });
  }
}

function validateNumberKeywords(schema: Record<string, unknown>, data: unknown, path: string, errors: CspAjvError[]): void {
  if (typeof data !== 'number') return;

  if (typeof schema.minimum === 'number' && data < schema.minimum) {
    pushError(errors, path, 'minimum', `must be >= ${schema.minimum}`, { comparison: '>=', limit: schema.minimum });
  }
  if (typeof schema.maximum === 'number' && data > schema.maximum) {
    pushError(errors, path, 'maximum', `must be <= ${schema.maximum}`, { comparison: '<=', limit: schema.maximum });
  }
  if (typeof schema.exclusiveMinimum === 'number' && data <= schema.exclusiveMinimum) {
    pushError(errors, path, 'exclusiveMinimum', `must be > ${schema.exclusiveMinimum}`, { comparison: '>', limit: schema.exclusiveMinimum });
  }
  if (typeof schema.exclusiveMaximum === 'number' && data >= schema.exclusiveMaximum) {
    pushError(errors, path, 'exclusiveMaximum', `must be < ${schema.exclusiveMaximum}`, { comparison: '<', limit: schema.exclusiveMaximum });
  }
  if (typeof schema.multipleOf === 'number' && data % schema.multipleOf !== 0) {
    pushError(errors, path, 'multipleOf', `must be multiple of ${schema.multipleOf}`, { multipleOf: schema.multipleOf });
  }
}

function validateArrayKeywords(schema: Record<string, unknown>, data: unknown, path: string, errors: CspAjvError[]): void {
  if (!Array.isArray(data)) return;

  if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
    pushError(errors, path, 'minItems', `must NOT have fewer than ${schema.minItems} items`, { limit: schema.minItems });
  }
  if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
    pushError(errors, path, 'maxItems', `must NOT have more than ${schema.maxItems} items`, { limit: schema.maxItems });
  }
  if (isJsonSchema(schema.items)) {
    data.forEach((item, index) => validateData(schema.items, item, `${path}/${index}`, errors));
  }
}

export class CspAjv2020 {
  public errors: CspAjvError[] | null = null;

  public validateSchema(schema: unknown): boolean {
    const errors: CspAjvError[] = [];
    validateSchemaObject(schema, '', errors);
    this.errors = errors.length > 0 ? errors : null;
    return errors.length === 0;
  }

  public compile(schema: unknown): CspValidateFunction {
    if (!this.validateSchema(schema)) {
      throw new Error(`schema is invalid: ${this.errorsText()}`);
    }

    const validate = ((data: unknown) => {
      const errors: CspAjvError[] = [];
      validateData(schema, data, '', errors);
      validate.errors = errors.length > 0 ? errors : null;
      this.errors = validate.errors;
      return errors.length === 0;
    }) as CspValidateFunction;
    validate.errors = null;
    return validate;
  }

  public validate(schema: unknown, data: unknown): boolean {
    return this.compile(schema)(data);
  }

  public errorsText(
    errors: CspAjvError[] | null | undefined = this.errors,
    { separator = ', ', dataVar = 'data' }: { separator?: string; dataVar?: string } = {},
  ): string {
    if (!errors || errors.length === 0) return 'No errors';
    return errors
      .map((error) => `${dataVar}${error.instancePath} ${error.message}`)
      .join(separator);
  }

  public addSchema(): this {
    return this;
  }

  public addMetaSchema(): this {
    return this;
  }

  public addVocabulary(): this {
    return this;
  }

  public addKeyword(): this {
    return this;
  }

  public addFormat(): this {
    return this;
  }

  public getSchema(): undefined {
    return undefined;
  }
}

const CspAjvDefault = CspAjv2020 as typeof CspAjv2020 & { default: typeof CspAjv2020 };
CspAjvDefault.default = CspAjv2020;

export { CspAjv2020 as Ajv2020 };
export default CspAjvDefault;
