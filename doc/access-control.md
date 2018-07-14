# Access Control in Syncable

Syncable applies access control with contributions from associations. In other words, the associations of an syncable is able to contribute access control entries to this very syncable, as well as permissions if it is a user under a specific context.

A syncable has 5 special properties of which the names start with `$`:

* `$associations`
* `$permissions`
* `$acl`
* `$grants`
* `$secures`

## Permission

Having a permission in syncable is being a state that allows the context to perform certain operation.

Examples: `admin`, `active`, `ready-for-password-reset`.

Some permissions are consumable, and some persist.
