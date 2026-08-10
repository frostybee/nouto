/**
 * Schema inference and anomaly detection for JSON arrays.
 * Analyzes arrays of objects to detect the "expected" schema
 * and highlights inconsistencies.
 */

export interface FieldSchema {
  /** Field name */
  name: string;
  /** Map of type name -> count of items with that type */
  typeCounts: Record<string, number>;
  /** The dominant (most common) type */
  dominantType: string;
  /** How many items have this field present */
  presentCount: number;
  /** Total items analyzed */
  totalItems: number;
  /** Consistency score (0-100). 100 = all items have same type. */
  consistency: number;
  /** Whether this field is always present */
  required: boolean;
}

export interface SchemaAnomaly {
  /** Index in the array where the anomaly was found */
  itemIndex: number;
  /** Field name */
  field: string;
  /** Description of the anomaly */
  message: string;
  /** Severity: 'warning' for type mismatches, 'info' for missing optional fields */
  severity: 'warning' | 'info';
}

export interface InferredSchema {
  /** Per-field schema information */
  fields: FieldSchema[];
  /** Detected anomalies */
  anomalies: SchemaAnomaly[];
  /** Total items analyzed */
  totalItems: number;
  /** Overall consistency score (0-100) */
  overallConsistency: number;
}

/**
 * Analyze an array of objects and infer the expected schema.
 * Returns field info and anomalies.
 */
export function inferSchema(data: any[]): InferredSchema {
  // Filter to only objects
  const objects = data.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  if (objects.length === 0) {
    return { fields: [], anomalies: [], totalItems: 0, overallConsistency: 100 };
  }

  const totalItems = objects.length;

  // Collect all field names and their type distributions
  const fieldMap = new Map<string, { typeCounts: Record<string, number>; presentCount: number }>();

  for (const obj of objects) {
    const seen = new Set<string>();
    for (const [key, value] of Object.entries(obj)) {
      seen.add(key);
      const type = getValueType(value);

      if (!fieldMap.has(key)) {
        fieldMap.set(key, { typeCounts: {}, presentCount: 0 });
      }
      const entry = fieldMap.get(key)!;
      entry.presentCount++;
      entry.typeCounts[type] = (entry.typeCounts[type] || 0) + 1;
    }

    // Mark missing fields for entries we haven't seen in this object
    for (const [key] of fieldMap) {
      if (!seen.has(key)) {
        // field exists in schema but not in this object -- no need to track absence in typeCounts
      }
    }
  }

  // Build field schemas
  const fields: FieldSchema[] = [];
  for (const [name, entry] of fieldMap) {
    const dominantType = Object.entries(entry.typeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    const typeValues = Object.values(entry.typeCounts);
    const maxTypeCount = Math.max(...typeValues);
    const consistency = totalItems > 0
      ? Math.round((maxTypeCount / totalItems) * 100)
      : 100;

    fields.push({
      name,
      typeCounts: entry.typeCounts,
      dominantType,
      presentCount: entry.presentCount,
      totalItems,
      consistency,
      required: entry.presentCount === totalItems,
    });
  }

  // Sort: required fields first, then by name
  fields.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Detect anomalies
  const anomalies: SchemaAnomaly[] = [];
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];

    for (const field of fields) {
      const value = obj[field.name];

      // Missing field that's present in most items
      if (value === undefined) {
        const presencePct = (field.presentCount / totalItems) * 100;
        if (presencePct >= 80) {
          anomalies.push({
            itemIndex: i,
            field: field.name,
            message: `Missing field "${field.name}" (present in ${field.presentCount}/${totalItems} items)`,
            severity: presencePct >= 95 ? 'warning' : 'info',
          });
        }
        continue;
      }

      // Type mismatch
      const actualType = getValueType(value);
      if (actualType !== field.dominantType && field.consistency >= 80) {
        anomalies.push({
          itemIndex: i,
          field: field.name,
          message: `Type mismatch for "${field.name}": expected ${field.dominantType}, got ${actualType}`,
          severity: 'warning',
        });
      }
    }
  }

  // Cap anomaly output to avoid overwhelming the UI
  const cappedAnomalies = anomalies.slice(0, 200);

  // Overall consistency
  const overallConsistency = fields.length > 0
    ? Math.round(fields.reduce((sum, f) => sum + f.consistency, 0) / fields.length)
    : 100;

  return {
    fields,
    anomalies: cappedAnomalies,
    totalItems,
    overallConsistency,
  };
}

function getValueType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
