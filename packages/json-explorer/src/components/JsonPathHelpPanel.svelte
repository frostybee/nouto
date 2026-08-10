<script lang="ts">
  import SlidePanel from '@nouto/ui/components/shared/SlidePanel.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();
</script>

<SlidePanel {open} title="JSONPath Reference" width={380} {onclose}>
  <div class="help-content">
    <section class="help-section">
      <h3 class="section-title">Syntax</h3>
      <table class="op-table">
        <tbody>
          <tr><td class="op-cell">$</td><td>Root object / array</td></tr>
          <tr><td class="op-cell">.key</td><td>Child property</td></tr>
          <tr><td class="op-cell">['key']</td><td>Bracket child (special chars)</td></tr>
          <tr><td class="op-cell">[n]</td><td>Array index (0-based)</td></tr>
          <tr><td class="op-cell">[*]</td><td>All children / array items</td></tr>
          <tr><td class="op-cell">..</td><td>Recursive descent (any depth)</td></tr>
          <tr><td class="op-cell">[start:end:step]</td><td>Array slice</td></tr>
          <tr><td class="op-cell">[?()]</td><td>Filter expression</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3 class="section-title">Filter Operators</h3>
      <table class="op-table">
        <tbody>
          <tr><td class="op-cell">==</td><td>Equal</td></tr>
          <tr><td class="op-cell">!=</td><td>Not equal</td></tr>
          <tr><td class="op-cell">&gt;</td><td>Greater than</td></tr>
          <tr><td class="op-cell">&lt;</td><td>Less than</td></tr>
          <tr><td class="op-cell">&gt;=</td><td>Greater or equal</td></tr>
          <tr><td class="op-cell">&lt;=</td><td>Less or equal</td></tr>
          <tr><td class="op-cell">&amp;&amp;</td><td>Logical AND</td></tr>
          <tr><td class="op-cell">||</td><td>Logical OR</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3 class="section-title">Examples</h3>
      <div class="examples">
        <div class="example-group">
          <div class="example-label">Root-level property</div>
          <code class="example-code">$.name</code>
          <span class="example-desc">The "name" field at the root</span>
        </div>

        <div class="example-group">
          <div class="example-label">All items in an array</div>
          <code class="example-code">$.users[*].email</code>
          <span class="example-desc">Email of every user</span>
        </div>

        <div class="example-group">
          <div class="example-label">Array index</div>
          <code class="example-code">$.data[0]</code>
          <span class="example-desc">First element of the "data" array</span>
        </div>

        <div class="example-group">
          <div class="example-label">Negative index</div>
          <code class="example-code">$.data[-1:]</code>
          <span class="example-desc">Last element of the "data" array</span>
        </div>

        <div class="example-group">
          <div class="example-label">Array slice</div>
          <code class="example-code">$.store.book[0:3]</code>
          <span class="example-desc">First three books</span>
        </div>

        <div class="example-group">
          <div class="example-label">Recursive descent</div>
          <code class="example-code">$..id</code>
          <span class="example-desc">All "id" fields at any depth</span>
        </div>

        <div class="example-group">
          <div class="example-label">Bracket notation</div>
          <code class="example-code">$['special-key']</code>
          <span class="example-desc">Keys with hyphens or special characters</span>
        </div>

        <div class="example-group">
          <div class="example-label">Filter — numeric</div>
          <code class="example-code">$.items[?(@.price &gt; 10)]</code>
          <span class="example-desc">Items where price is greater than 10</span>
        </div>

        <div class="example-group">
          <div class="example-label">Filter — boolean</div>
          <code class="example-code">$.users[?(@.active == true)]</code>
          <span class="example-desc">Only active users</span>
        </div>

        <div class="example-group">
          <div class="example-label">Filter — existence</div>
          <code class="example-code">$.items[?(@.discount)]</code>
          <span class="example-desc">Items that have a "discount" field</span>
        </div>

        <div class="example-group">
          <div class="example-label">Filter — combined</div>
          <code class="example-code">$.products[?(@.price &lt; 50 &amp;&amp; @.inStock == true)]</code>
          <span class="example-desc">Affordable in-stock products</span>
        </div>
      </div>
    </section>

    <section class="help-section">
      <h3 class="section-title">Tips</h3>
      <ul class="tips-list">
        <li><code>$</code> is optional — <code>data[*].name</code> works like <code>$.data[*].name</code></li>
        <li>Filters use <code>@</code> to reference the current element</li>
        <li>Recursive descent (<code>..</code>) searches all levels of nesting</li>
        <li>Use bracket notation for keys containing dots, hyphens, or spaces</li>
        <li>Negative indices count from the end: <code>[-1]</code> is the last element</li>
      </ul>
    </section>
  </div>
</SlidePanel>

<style>
  .help-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .help-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin: 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .op-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
  }

  .op-table td {
    padding: 3px 8px 3px 0;
    color: var(--hf-foreground);
  }

  .op-cell {
    font-family: var(--hf-editor-font-family);
    color: var(--hf-debugTokenExpression-string);
    font-weight: 600;
    white-space: nowrap;
    width: 120px;
  }

  .examples {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .example-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .example-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .example-code {
    display: block;
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    color: var(--hf-debugTokenExpression-string);
    background: var(--hf-textCodeBlock-background);
    padding: 4px 8px;
    border-radius: 3px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .example-desc {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .tips-list {
    margin: 0;
    padding-left: 16px;
    font-size: 12px;
    color: var(--hf-foreground);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tips-list code {
    font-family: var(--hf-editor-font-family);
    color: var(--hf-debugTokenExpression-string);
    font-size: 11px;
  }
</style>
