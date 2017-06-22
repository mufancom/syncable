# Syncable

## Roadmap

- [ ] Client-side hooks
- [ ] Server-side hooks
  - Change spawning
- [ ] Removal support
- [ ] Authorization hooks
- [ ] Offline support
- [ ] Visibility support

## Build

```sh
npm install

cd syncable
npm link

cd ../syncable-client
npm link
npm install

cd ../syncable-server
npm link
npm install

cd ..
npm run build
```
