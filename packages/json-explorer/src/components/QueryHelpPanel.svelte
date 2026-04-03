<script lang="ts">
  import SlidePanel from '@nouto/ui/components/shared/SlidePanel.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();
</script>

<SlidePanel {open} title="Query Reference" width={380} {onclose}>
  <div class="help-content">
    <section class="help-section">
      <h3 class="section-title">Operators</h3>
      <table class="op-table">
        <tbody>
          <tr><td class="op-cell">=</td><td>Equal</td></tr>
          <tr><td class="op-cell">!=</td><td>Not equal</td></tr>
          <tr><td class="op-cell">&gt;</td><td>Greater than</td></tr>
          <tr><td class="op-cell">&lt;</td><td>Less than</td></tr>
          <tr><td class="op-cell">&gt;=</td><td>Greater or equal</td></tr>
          <tr><td class="op-cell">&lt;=</td><td>Less or equal</td></tr>
          <tr><td class="op-cell">~</td><td>Regex match</td></tr>
          <tr><td class="op-cell">contains</td><td>Substring match</td></tr>
          <tr><td class="op-cell">startsWith</td><td>Starts with</td></tr>
          <tr><td class="op-cell">endsWith</td><td>Ends with</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3 class="section-title">Combinators</h3>
      <table class="op-table">
        <tbody>
          <tr><td class="op-cell">AND</td><td>Both must match</td></tr>
          <tr><td class="op-cell">OR</td><td>Either must match</td></tr>
          <tr><td class="op-cell">NOT</td><td>Negate a condition</td></tr>
          <tr><td class="op-cell">( )</td><td>Group expressions</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3 class="section-title">Examples</h3>
      <div class="examples">
        <div class="example-group">
          <div class="example-label">String contains</div>
          <code class="example-code">name contains "john"</code>
          <span class="example-desc">Items where name includes "john" (case-insensitive)</span>
        </div>

        <div class="example-group">
          <div class="example-label">Nested field contains</div>
          <code class="example-code">address.city contains "york"</code>
          <span class="example-desc">Items where address.city includes "york"</span>
        </div>

        <div class="example-group">
          <div class="example-label">Starts with</div>
          <code class="example-code">email startsWith "admin"</code>
          <span class="example-desc">Items where email starts with "admin"</span>
        </div>

        <div class="example-group">
          <div class="example-label">Ends with</div>
          <code class="example-code">url endsWith ".json"</code>
          <span class="example-desc">Items where url ends with ".json"</span>
        </div>

        <div class="example-group">
          <div class="example-label">Numeric comparison</div>
          <code class="example-code">age > 30</code>
          <span class="example-desc">Items where age is greater than 30</span>
        </div>

        <div class="example-group">
          <div class="example-label">Exact match</div>
          <code class="example-code">status = "active"</code>
          <span class="example-desc">Items where status is exactly "active"</span>
        </div>

        <div class="example-group">
          <div class="example-label">Regex match</div>
          <code class="example-code">name ~ "^A.*son$"</code>
          <span class="example-desc">Items where name matches the regex (case-insensitive)</span>
        </div>

        <div class="example-group">
          <div class="example-label">Null check</div>
          <code class="example-code">email != null</code>
          <span class="example-desc">Items where email is not null</span>
        </div>

        <div class="example-group">
          <div class="example-label">Boolean check</div>
          <code class="example-code">verified = true</code>
          <span class="example-desc">Items where verified is true</span>
        </div>

        <div class="example-group">
          <div class="example-label">Combined (AND)</div>
          <code class="example-code">age >= 18 AND status = "active"</code>
          <span class="example-desc">Both conditions must match</span>
        </div>

        <div class="example-group">
          <div class="example-label">Combined (OR)</div>
          <code class="example-code">type = "admin" OR type = "moderator"</code>
          <span class="example-desc">Either condition matches</span>
        </div>

        <div class="example-group">
          <div class="example-label">Negation</div>
          <code class="example-code">NOT status = "deleted"</code>
          <span class="example-desc">Items where status is not "deleted"</span>
        </div>

        <div class="example-group">
          <div class="example-label">Grouping</div>
          <code class="example-code">(age > 30 OR role = "admin") AND active = true</code>
          <span class="example-desc">Use parentheses to control precedence</span>
        </div>

        <div class="example-group">
          <div class="example-label">Nested field path</div>
          <code class="example-code">address.city = "Berlin"</code>
          <span class="example-desc">Dot notation for nested objects</span>
        </div>

        <div class="example-group">
          <div class="example-label">Array index</div>
          <code class="example-code">tags[0] = "urgent"</code>
          <span class="example-desc">Access array elements by index</span>
        </div>
      </div>
    </section>

    <section class="help-section">
      <h3 class="section-title">Tips</h3>
      <ul class="tips-list">
        <li>String values must be quoted: <code>"value"</code></li>
        <li>Numbers, <code>true</code>, <code>false</code>, and <code>null</code> are unquoted</li>
        <li><code>contains</code>, <code>startsWith</code>, and <code>endsWith</code> are case-insensitive</li>
        <li>Press <kbd>Enter</kbd> to run query, <kbd>Shift+Enter</kbd> for previous match</li>
        <li>Use dot notation for nested fields: <code>user.address.city</code></li>
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
    width: 90px;
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

  .tips-list kbd {
    display: inline-block;
    padding: 1px 4px;
    font-family: var(--hf-editor-font-family);
    font-size: 10px;
    color: var(--hf-foreground);
    background: var(--hf-button-secondaryBackground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
  }
</style>
