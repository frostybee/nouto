import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { MOCK_VARIABLES } from '../value-transforms';
import { activeVariablesList } from '../../stores/environment.svelte';

// Static completions from MOCK_VARIABLES (faker, uuid, timestamp, etc.)
// apply text does NOT include the leading {{ — `from` is set after it.
const mockCompletions: (Completion & { namespace?: string })[] = MOCK_VARIABLES.map(v => {
  const hasArgs = !!v.args;
  return {
    label: v.name,
    type: hasArgs ? 'function' : 'variable',
    detail: v.namespace ?? '',
    info: hasArgs ? `(${v.args}) ${v.description}` : v.description,
    apply: hasArgs ? `${v.name}, }}` : `${v.name}}}`,
    namespace: v.namespace,
  };
});

function templateVarCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match an unclosed {{ followed by partial input
  const match = context.matchBefore(/\{\{[\w$.,\s/\\:-]*/);
  if (!match) return null;

  // `from` starts AFTER the {{ so validFor only checks the query portion
  const from = match.from + 2;

  // Extract query: everything after the opening {{
  const query = match.text.slice(2).toLowerCase();

  // Check if the query looks like a namespace prefix (e.g. "$faker.")
  const namespacePrefixMatch = query.match(/^\$(\w+)\.$/);

  // Filter mock completions
  const filteredMock = mockCompletions.filter(c => {
    if (namespacePrefixMatch) {
      return c.label.toLowerCase().startsWith(query);
    }
    return !query || c.label.toLowerCase().includes(query) ||
      (c.info && typeof c.info === 'string' && c.info.toLowerCase().includes(query));
  });

  // Build dynamic completions from active environment variables
  const envVars = activeVariablesList();
  const filteredEnv: Completion[] = envVars
    .filter(v => !query || v.key.toLowerCase().includes(query))
    .map(v => ({
      label: v.key,
      type: 'variable',
      detail: v.isSecret ? '******' : v.value,
      info: 'Environment variable',
      apply: `${v.key}}}`,
    }));

  // Order: namespace prefix → mock first; otherwise env first
  const options = namespacePrefixMatch
    ? [...filteredMock, ...filteredEnv]
    : [...filteredEnv, ...filteredMock];

  if (options.length === 0) return null;

  return {
    from,
    options: options.slice(0, 30),
    validFor: /^[\w$.,\s/\\:-]*$/,
  };
}

export function templateVariableAutocomplete(): Extension {
  return autocompletion({
    override: [templateVarCompletionSource],
    activateOnTyping: true,
    maxRenderedOptions: 30,
  });
}
