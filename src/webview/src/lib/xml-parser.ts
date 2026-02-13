/**
 * XML parser that converts XML string into a tree structure
 * using the browser's built-in DOMParser.
 */

export interface XmlNode {
  type: 'element' | 'text' | 'comment' | 'cdata' | 'processing-instruction';
  name?: string;         // tag name for elements
  attributes?: Record<string, string>;
  children?: XmlNode[];
  value?: string;        // text content
}

/**
 * Parse an XML string into a tree of XmlNodes.
 */
export function parseXml(xml: string): XmlNode | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');

    // Check for parse errors
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
      return null;
    }

    return convertNode(doc.documentElement);
  } catch {
    return null;
  }
}

function convertNode(node: Node): XmlNode {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const el = node as Element;
      const attributes: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attributes[attr.name] = attr.value;
      }
      const children: XmlNode[] = [];
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = convertNode(el.childNodes[i]);
        // Skip whitespace-only text nodes
        if (child.type === 'text' && (!child.value || !child.value.trim())) continue;
        children.push(child);
      }
      return {
        type: 'element',
        name: el.tagName,
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
        children: children.length > 0 ? children : undefined,
      };
    }
    case Node.TEXT_NODE:
      return {
        type: 'text',
        value: node.textContent || '',
      };
    case Node.COMMENT_NODE:
      return {
        type: 'comment',
        value: node.textContent || '',
      };
    case Node.CDATA_SECTION_NODE:
      return {
        type: 'cdata',
        value: node.textContent || '',
      };
    case Node.PROCESSING_INSTRUCTION_NODE:
      return {
        type: 'processing-instruction',
        name: (node as ProcessingInstruction).target,
        value: (node as ProcessingInstruction).data,
      };
    default:
      return {
        type: 'text',
        value: node.textContent || '',
      };
  }
}
