<script lang="ts">
  import type { Collection } from '../../types';
  import CollectionItem from './CollectionItem.svelte';

  interface Props {
    collections: Collection[];
    postMessage: (message: any) => void;
  }
  let { collections, postMessage }: Props = $props();
</script>

<div class="collection-tree">
  {#each collections as collection (collection.id)}
    <CollectionItem {collection} {postMessage} />
  {/each}
</div>

<style>
  .collection-tree {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
  }
</style>
