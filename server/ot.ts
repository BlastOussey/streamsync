// Operational Transformation Engine
// Supports Insert and Delete operations

export type Operation =
  | { type: 'insert'; position: number; text: string }
  | { type: 'delete'; position: number; length: number };

// Apply an operation to a document string
export function applyOperation(doc: string, op: Operation): string {
  if (op.type === 'insert') {
    return doc.slice(0, op.position) + op.text + doc.slice(op.position);
  }
  if (op.type === 'delete') {
    return doc.slice(0, op.position) + doc.slice(op.position + op.length);
  }
  return doc;
}

// Transform op1 against op2 (op2 happened concurrently)
// Returns a new op1 that can be applied after op2
export function transformOperation(op1: Operation, op2: Operation): Operation {
  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op2.position <= op1.position) {
      return { ...op1, position: op1.position + op2.text.length };
    }
    return op1;
  }

  if (op1.type === 'insert' && op2.type === 'delete') {
    if (op2.position + op2.length <= op1.position) {
      return { ...op1, position: op1.position - op2.length };
    }
    if (op2.position < op1.position) {
      return { ...op1, position: op2.position };
    }
    return op1;
  }

  if (op1.type === 'delete' && op2.type === 'insert') {
    if (op2.position <= op1.position) {
      return { ...op1, position: op1.position + op2.text.length };
    }
    return op1;
  }

  if (op1.type === 'delete' && op2.type === 'delete') {
    if (op2.position + op2.length <= op1.position) {
      return { ...op1, position: op1.position - op2.length };
    }
    if (op2.position >= op1.position + op1.length) {
      return op1;
    }
    // Overlapping deletes — shrink op1
    const overlapStart = Math.max(op1.position, op2.position);
    const overlapEnd = Math.min(op1.position + op1.length, op2.position + op2.length);
    const overlap = overlapEnd - overlapStart;
    return { ...op1, length: Math.max(0, op1.length - overlap) };
  }

  return op1;
}
