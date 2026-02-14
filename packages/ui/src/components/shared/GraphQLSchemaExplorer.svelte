<script lang="ts">
  import type { GraphQLType, GraphQLField } from '../../types';
  import {
    graphqlSchemaStore,
    queryFields,
    mutationFields,
    subscriptionFields,
    userTypes,
  } from '../../stores/graphqlSchema';
  import GraphQLTypeNode from './GraphQLTypeNode.svelte';

  let searchQuery = $state('');
  let expandedSections = $state<Record<string, boolean>>({
    queries: true,
    mutations: true,
    subscriptions: true,
    types: false,
  });
  let selectedType = $state<GraphQLType | null>(null);

  const store = $derived($graphqlSchemaStore);
  const queries = $derived($queryFields);
  const mutations = $derived($mutationFields);
  const subscriptions = $derived($subscriptionFields);
  const types = $derived($userTypes);

  const lowerSearch = $derived(searchQuery.toLowerCase());

  function matchesSearch(name: string): boolean {
    if (!lowerSearch) return true;
    return name.toLowerCase().includes(lowerSearch);
  }

  function filterFields(fields: GraphQLField[]): GraphQLField[] {
    if (!lowerSearch) return fields;
    return fields.filter(f => matchesSearch(f.name));
  }

  function filterTypes(typesList: GraphQLType[]): GraphQLType[] {
    if (!lowerSearch) return typesList;
    return typesList.filter(t => matchesSearch(t.name));
  }

  const filteredQueries = $derived(filterFields(queries));
  const filteredMutations = $derived(filterFields(mutations));
  const filteredSubscriptions = $derived(filterFields(subscriptions));
  const filteredTypes = $derived(filterTypes(types));

  function toggleSection(section: string) {
    expandedSections = { ...expandedSections, [section]: !expandedSections[section] };
  }

  function selectType(type: GraphQLType) {
    selectedType = type;
  }

  function clearSelectedType() {
    selectedType = null;
  }

  function getKindBadgeClass(kind: string): string {
    switch (kind) {
      case 'OBJECT': return 'kind-object';
      case 'ENUM': return 'kind-enum';
      case 'INPUT_OBJECT': return 'kind-input';
      case 'INTERFACE': return 'kind-interface';
      case 'UNION': return 'kind-union';
      case 'SCALAR': return 'kind-scalar';
      default: return '';
    }
  }

  function formatTypeRef(ref: any): string {
    if (ref.kind === 'NON_NULL' && ref.ofType) {
      return `${formatTypeRef(ref.ofType)}!`;
    }
    if (ref.kind === 'LIST' && ref.ofType) {
      return `[${formatTypeRef(ref.ofType)}]`;
    }
    return ref.name || 'Unknown';
  }
</script>

<div class="schema-explorer">
  {#if store.loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Fetching schema...</span>
    </div>
  {:else if store.error}
    <div class="error-state">
      <span class="codicon codicon-error"></span>
      <span>{store.error}</span>
    </div>
  {:else if store.schema}
    {#if selectedType}
      <!-- Type detail view -->
      <div class="type-detail">
        <button class="back-btn" onclick={clearSelectedType}>
          <span class="codicon codicon-arrow-left"></span> Back
        </button>
        <div class="type-detail-header">
          <span class="kind-badge {getKindBadgeClass(selectedType.kind)}">{selectedType.kind}</span>
          <span class="type-detail-name">{selectedType.name}</span>
        </div>
        {#if selectedType.description}
          <p class="type-detail-description">{selectedType.description}</p>
        {/if}

        {#if selectedType.fields && selectedType.fields.length > 0}
          <div class="type-detail-section">
            <div class="section-title">Fields ({selectedType.fields.length})</div>
            {#each selectedType.fields as field}
              <GraphQLTypeNode {field} />
            {/each}
          </div>
        {/if}

        {#if selectedType.enumValues && selectedType.enumValues.length > 0}
          <div class="type-detail-section">
            <div class="section-title">Values ({selectedType.enumValues.length})</div>
            {#each selectedType.enumValues as val}
              <div class="enum-value" class:deprecated={val.isDeprecated}>
                <span class="enum-name">{val.name}</span>
                {#if val.isDeprecated}
                  <span class="deprecated-badge">DEPRECATED</span>
                {/if}
                {#if val.description}
                  <span class="enum-description">{val.description}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if selectedType.inputFields && selectedType.inputFields.length > 0}
          <div class="type-detail-section">
            <div class="section-title">Input Fields ({selectedType.inputFields.length})</div>
            {#each selectedType.inputFields as field}
              <GraphQLTypeNode {field} showArgs={false} />
            {/each}
          </div>
        {/if}

        {#if selectedType.interfaces && selectedType.interfaces.length > 0}
          <div class="type-detail-section">
            <div class="section-title">Implements</div>
            <div class="interfaces-list">
              {#each selectedType.interfaces as iface}
                <span class="interface-name">{formatTypeRef(iface)}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if selectedType.possibleTypes && selectedType.possibleTypes.length > 0}
          <div class="type-detail-section">
            <div class="section-title">Possible Types</div>
            <div class="interfaces-list">
              {#each selectedType.possibleTypes as pt}
                <span class="interface-name">{formatTypeRef(pt)}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Main explorer view -->
      <div class="search-bar">
        <input
          type="text"
          class="search-input"
          placeholder="Search types and fields..."
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button class="clear-search" onclick={() => searchQuery = ''} title="Clear search">
            <span class="codicon codicon-close"></span>
          </button>
        {/if}
      </div>

      <div class="sections">
        {#if queries.length > 0}
          <div class="section">
            <button class="section-header" onclick={() => toggleSection('queries')}>
              <span class="codicon" class:codicon-chevron-right={!expandedSections.queries} class:codicon-chevron-down={expandedSections.queries}></span>
              <span class="section-name">Queries</span>
              <span class="count-badge">{filteredQueries.length}</span>
            </button>
            {#if expandedSections.queries}
              <div class="section-content">
                {#each filteredQueries as field}
                  <GraphQLTypeNode {field} />
                {/each}
                {#if filteredQueries.length === 0}
                  <div class="no-results">No matching queries</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if mutations.length > 0}
          <div class="section">
            <button class="section-header" onclick={() => toggleSection('mutations')}>
              <span class="codicon" class:codicon-chevron-right={!expandedSections.mutations} class:codicon-chevron-down={expandedSections.mutations}></span>
              <span class="section-name">Mutations</span>
              <span class="count-badge">{filteredMutations.length}</span>
            </button>
            {#if expandedSections.mutations}
              <div class="section-content">
                {#each filteredMutations as field}
                  <GraphQLTypeNode {field} />
                {/each}
                {#if filteredMutations.length === 0}
                  <div class="no-results">No matching mutations</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if subscriptions.length > 0}
          <div class="section">
            <button class="section-header" onclick={() => toggleSection('subscriptions')}>
              <span class="codicon" class:codicon-chevron-right={!expandedSections.subscriptions} class:codicon-chevron-down={expandedSections.subscriptions}></span>
              <span class="section-name">Subscriptions</span>
              <span class="count-badge">{filteredSubscriptions.length}</span>
            </button>
            {#if expandedSections.subscriptions}
              <div class="section-content">
                {#each filteredSubscriptions as field}
                  <GraphQLTypeNode {field} />
                {/each}
                {#if filteredSubscriptions.length === 0}
                  <div class="no-results">No matching subscriptions</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if types.length > 0}
          <div class="section">
            <button class="section-header" onclick={() => toggleSection('types')}>
              <span class="codicon" class:codicon-chevron-right={!expandedSections.types} class:codicon-chevron-down={expandedSections.types}></span>
              <span class="section-name">Types</span>
              <span class="count-badge">{filteredTypes.length}</span>
            </button>
            {#if expandedSections.types}
              <div class="section-content">
                {#each filteredTypes as type}
                  <button class="type-item" onclick={() => selectType(type)}>
                    <span class="kind-badge {getKindBadgeClass(type.kind)}">{type.kind}</span>
                    <span class="type-name">{type.name}</span>
                  </button>
                {/each}
                {#if filteredTypes.length === 0}
                  <div class="no-results">No matching types</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="empty-state">
      <span class="codicon codicon-symbol-structure"></span>
      <span>Click "Fetch Schema" to explore the API</span>
    </div>
  {/if}
</div>

<style>
  .schema-explorer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    text-align: center;
  }

  .error-state {
    color: var(--hf-errorForeground);
    flex-direction: column;
    word-break: break-word;
  }

  .empty-state {
    flex-direction: column;
    gap: 8px;
  }

  .empty-state .codicon {
    font-size: 24px;
    opacity: 0.5;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--hf-panel-border);
    border-top-color: var(--hf-focusBorder);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .search-bar {
    position: relative;
    padding: 8px;
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    padding: 5px 28px 5px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .search-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .search-input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .clear-search {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    padding: 2px;
    opacity: 0.6;
  }

  .clear-search:hover {
    opacity: 1;
  }

  .sections {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 8px;
  }

  .section {
    margin-bottom: 4px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 4px;
    background: none;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
  }

  .section-header:hover {
    background: var(--hf-list-hoverBackground);
    border-radius: 3px;
  }

  .section-name {
    flex: 1;
  }

  .count-badge {
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 8px;
    font-size: 10px;
    font-weight: 500;
  }

  .section-content {
    padding-left: 8px;
  }

  .no-results {
    padding: 4px 18px;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    font-style: italic;
  }

  .type-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 4px 3px 18px;
    background: none;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    text-align: left;
  }

  .type-item:hover {
    background: var(--hf-list-hoverBackground);
    border-radius: 3px;
  }

  .type-name {
    font-family: var(--hf-editor-font-family), monospace;
  }

  .kind-badge {
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .kind-object {
    background: rgba(75, 191, 255, 0.15);
    color: #4bbfff;
  }

  .kind-enum {
    background: rgba(200, 150, 255, 0.15);
    color: #c896ff;
  }

  .kind-input {
    background: rgba(255, 200, 50, 0.15);
    color: #ee9d28;
  }

  .kind-interface {
    background: rgba(100, 255, 200, 0.15);
    color: #64ffc8;
  }

  .kind-union {
    background: rgba(255, 150, 150, 0.15);
    color: #ff9696;
  }

  .kind-scalar {
    background: rgba(180, 180, 180, 0.15);
    color: #b4b4b4;
  }

  /* Type detail view */
  .type-detail {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 8px;
    gap: 8px;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: none;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 11px;
    align-self: flex-start;
  }

  .back-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .type-detail-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .type-detail-name {
    font-size: 14px;
    font-weight: 600;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .type-detail-description {
    margin: 0;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    font-style: italic;
  }

  .type-detail-section {
    margin-top: 4px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 0;
    border-bottom: 1px solid var(--hf-panel-border);
    margin-bottom: 4px;
  }

  .enum-value {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0 2px 18px;
    font-size: 12px;
  }

  .enum-value.deprecated {
    opacity: 0.6;
  }

  .enum-name {
    color: var(--hf-symbolIcon-enumeratorMemberForeground, #75beff);
    font-family: var(--hf-editor-font-family), monospace;
  }

  .enum-description {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    font-style: italic;
  }

  .deprecated-badge {
    padding: 1px 4px;
    background: var(--hf-inputValidation-warningBackground, rgba(255, 200, 0, 0.15));
    color: var(--hf-editorWarning-foreground, #fca130);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .interfaces-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 0 4px 18px;
  }

  .interface-name {
    padding: 2px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    font-size: 11px;
    font-family: var(--hf-editor-font-family), monospace;
  }
</style>
