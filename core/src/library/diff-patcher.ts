import {Delta, DiffPatcher} from 'jsondiffpatch';
import _ from 'lodash';

const diffPatcher = new DiffPatcher({
  objectHash(object: any) {
    return object.id || object._id || object.key;
  },
  cloneDiffValues: true,
});

export function diff(left: any, right: any): Delta | undefined {
  let delta = diffPatcher.diff(left, right);

  // Package jsondiffpatch keeps the old value for operations like reverse /
  // unpatch. And in our case we don't need them so removing them will make the
  // updates more compact.

  return (
    delta &&
    _.cloneDeepWith(delta, value => {
      if (Array.isArray(value)) {
        switch (value.length) {
          case 1:
            // new value
            return value;
          case 2:
            // replaced value
            return [0, value[1]];
          //        ^ old value replaced with placeholder 0
          case 3: {
            switch (value[2]) {
              case 0:
                // delete
                // value[1] should also be 0
                return [0, 0, 0];
              //        ^ old value replaced with placeholder 0
              case 2:
              // text diffs
              case 3:
              // array moves
              default:
                return value;
            }
          }
          default:
            return value;
        }
      } else {
        return undefined;
      }
    })
  );
}

export function patch(left: any, delta: Delta): void {
  diffPatcher.patch(left, delta);
}
