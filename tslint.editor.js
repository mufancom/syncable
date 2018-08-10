const {rules} = require('vts/tslint');

module.exports = {
  rules: pick(rules, ['ordered-imports']),
};

function pick(rules, names) {
  return names.reduce((picked, name) => {
    picked[name] = rules[name];
    return picked;
  }, {});
}
