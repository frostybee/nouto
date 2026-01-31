<script lang="ts">
  import { collections } from '../../stores/collections';
  import CollectionItem from './CollectionItem.svelte';
</script>

<div class="collection-tree">
  {#each $collections as collection (collection.id)}
    <CollectionItem {collection} />
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
