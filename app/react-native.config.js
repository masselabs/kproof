const path = require('path');

// mopro_bindings is fetched by scripts/fetch-mopro.sh and linked as a local
// package (`file:./mopro_bindings`); autolinking is pointed at it explicitly.
module.exports = {
  dependencies: {
    'mopro-ffi': {
      root: path.join(__dirname, 'mopro_bindings'),
      platforms: {ios: {}, android: {}},
    },
  },
  assets: ['./assets/fonts'],
};
