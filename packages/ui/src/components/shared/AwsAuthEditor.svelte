<script lang="ts">
  import type { AuthState } from '../../stores/request';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    auth: AuthState;
    onchange: (auth: AuthState) => void;
  }
  let { auth, onchange }: Props = $props();

  const commonRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
    'sa-east-1', 'ca-central-1', 'me-south-1', 'af-south-1',
  ];

  const commonServices = [
    's3', 'execute-api', 'dynamodb', 'lambda', 'sqs', 'sns', 'ses',
    'ec2', 'iam', 'sts', 'cloudformation', 'cloudwatch', 'kinesis',
  ];

  let showSecretKey = $state(false);
  // svelte-ignore state_referenced_locally
  let customRegion = $state(!auth.awsRegion || !commonRegions.includes(auth.awsRegion));
  // svelte-ignore state_referenced_locally
  let customService = $state(!auth.awsService || !commonServices.includes(auth.awsService));

  function update(field: string, value: string) {
    onchange({ ...auth, [field]: value });
  }

  function handleRegionChange(value: string) {
    if (value === '__custom__') {
      customRegion = true;
      update('awsRegion', '');
    } else {
      customRegion = false;
      update('awsRegion', value);
    }
  }

  function handleServiceChange(value: string) {
    if (value === '__custom__') {
      customService = true;
      update('awsService', '');
    } else {
      customService = false;
      update('awsService', value);
    }
  }
</script>

<div class="aws-auth-editor">
  <div class="auth-field">
    <label for="aws-access-key">Access Key</label>
    <input
      id="aws-access-key"
      type="text"
      placeholder="AKIAIOSFODNN7EXAMPLE"
      value={auth.awsAccessKey || ''}
      oninput={(e) => update('awsAccessKey', e.currentTarget.value)}
    />
  </div>

  <div class="auth-field">
    <label for="aws-secret-key">Secret Key</label>
    <div class="password-input-wrapper">
      <input
        id="aws-secret-key"
        type={showSecretKey ? 'text' : 'password'}
        placeholder="wJalrXUtnFEMI/K7MDENG..."
        value={auth.awsSecretKey || ''}
        oninput={(e) => update('awsSecretKey', e.currentTarget.value)}
      />
      <Tooltip text={showSecretKey ? 'Hide secret key' : 'Show secret key'}>
        <button
          class="toggle-password-btn"
          onclick={() => { showSecretKey = !showSecretKey; }}
          aria-label={showSecretKey ? 'Hide secret key' : 'Show secret key'}
        >
          <i class="codicon" class:codicon-eye={!showSecretKey} class:codicon-eye-closed={showSecretKey}></i>
        </button>
      </Tooltip>
    </div>
  </div>

  <div class="auth-field">
    <label for="aws-region">Region</label>
    {#if customRegion}
      <div class="custom-input-row">
        <input
          id="aws-region"
          type="text"
          placeholder="custom-region-1"
          value={auth.awsRegion || ''}
          oninput={(e) => update('awsRegion', e.currentTarget.value)}
        />
        <Tooltip text="Switch to dropdown">
          <button class="switch-btn" onclick={() => { customRegion = false; update('awsRegion', commonRegions[0]); }} aria-label="Switch to dropdown">
            <i class="codicon codicon-chevron-down"></i>
          </button>
        </Tooltip>
      </div>
    {:else}
      <select
        id="aws-region"
        class="styled-select"
        value={auth.awsRegion || commonRegions[0]}
        onchange={(e) => handleRegionChange(e.currentTarget.value)}
      >
        {#each commonRegions as region}
          <option value={region}>{region}</option>
        {/each}
        <option value="__custom__">Custom...</option>
      </select>
    {/if}
  </div>

  <div class="auth-field">
    <label for="aws-service">Service</label>
    {#if customService}
      <div class="custom-input-row">
        <input
          id="aws-service"
          type="text"
          placeholder="custom-service"
          value={auth.awsService || ''}
          oninput={(e) => update('awsService', e.currentTarget.value)}
        />
        <Tooltip text="Switch to dropdown">
          <button class="switch-btn" onclick={() => { customService = false; update('awsService', commonServices[0]); }} aria-label="Switch to dropdown">
            <i class="codicon codicon-chevron-down"></i>
          </button>
        </Tooltip>
      </div>
    {:else}
      <select
        id="aws-service"
        class="styled-select"
        value={auth.awsService || commonServices[0]}
        onchange={(e) => handleServiceChange(e.currentTarget.value)}
      >
        {#each commonServices as svc}
          <option value={svc}>{svc}</option>
        {/each}
        <option value="__custom__">Custom...</option>
      </select>
    {/if}
  </div>

  <div class="auth-field">
    <label for="aws-session-token">Session Token <span class="optional">(optional)</span></label>
    <input
      id="aws-session-token"
      type="text"
      placeholder="Temporary session token"
      value={auth.awsSessionToken || ''}
      oninput={(e) => update('awsSessionToken', e.currentTarget.value)}
    />
  </div>

  <p class="auth-hint">
    The request will be signed using AWS Signature Version 4. Authorization and date headers are added automatically.
  </p>
</div>

<style>
  .aws-auth-editor {
    display: flex;
    flex-direction: column;
  }

  .auth-field {
    margin-bottom: 12px;
  }

  .auth-field:last-of-type {
    margin-bottom: 0;
  }

  .auth-field label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--hf-foreground);
    margin-bottom: 6px;
  }

  .optional {
    font-weight: 400;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .auth-field input {
    width: 100%;
    padding: 8px 12px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .auth-field input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .auth-field input::placeholder {
    color: var(--hf-input-placeholderForeground);
  }

  .styled-select {
    width: 100%;
    padding: 8px 12px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--hf-editor-font-family), monospace;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23cccccc' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 30px;
  }

  .styled-select:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .styled-select option {
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
  }

  .custom-input-row {
    display: flex;
    gap: 4px;
  }

  .custom-input-row input {
    flex: 1;
  }

  .switch-btn {
    padding: 6px 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .switch-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input-wrapper input {
    padding-right: 40px;
  }

  .toggle-password-btn {
    position: absolute;
    right: 4px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .toggle-password-btn:hover {
    opacity: 1;
  }

  .auth-hint {
    margin: 12px 0 0;
    padding: 8px;
    background: var(--hf-textBlockQuote-background);
    border-left: 3px solid var(--hf-textBlockQuote-border);
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    border-radius: 0 4px 4px 0;
  }
</style>
