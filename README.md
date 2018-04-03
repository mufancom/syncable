# Syncable

## Load

1.  `client` connects to `server`.
2.  `client` send subscription to specific `view queries` to `server`. E.g.:

    ```js
    {name: 'basic'}
    {name: 'workbench'}
    {name: 'workbench', tags: ['<tag-id>']}
    {name: 'archived', tags: ['<tag-id>'], page: 2}
    ```

3.  `server` preloads syncables according to the `view queries`.
4.  `server` resolves those syncables and constructs instances for access control.
5.  `server` sends back accessible syncables, and errors if an `as-dependency` link is not accessible.
6.  if there's more and the limit is not reached, `server` will do that again.
