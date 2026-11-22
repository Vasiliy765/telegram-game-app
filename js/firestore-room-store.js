window.FirebaseRoomStore = (() => {
  const collectionNames = {
    rooms: 'durakRooms',
    tictactoeRooms: 'tictactoeRooms',
    battleshipRooms: 'battleshipRooms',
  };
  const subscriptions = [];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readPath(value, path) {
    return path.reduce((current, key) => current == null ? null : current[key], value);
  }

  function writePath(value, path, nextValue) {
    if (!path.length) return clone(nextValue);
    const root = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    let current = root;
    path.slice(0, -1).forEach((key) => {
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key];
    });
    const last = path[path.length - 1];
    if (nextValue == null) delete current[last];
    else current[last] = clone(nextValue);
    return root;
  }

  function pathsEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  class RoomSnapshot {
    constructor(value, reference) {
      this.value = clone(value);
      this.ref = reference;
      this.key = reference.key;
    }

    val() {
      return clone(this.value);
    }

    exists() {
      return this.value !== null && this.value !== undefined;
    }
  }

  class RoomReference {
    constructor(segments) {
      this.segments = segments;
      this.collection = collectionNames[segments[0]] || segments[0];
      this.documentId = segments[1];
      this.fieldPath = segments.slice(2);
      if (segments.length < 2) throw new Error('A Firestore room collection and id are required.');
    }

    get key() {
      return this.segments[this.segments.length - 1] || null;
    }

    get parent() {
      return this.segments.length > 1
        ? new RoomReference(this.segments.slice(0, -1))
        : null;
    }

    documentReference() {
      return window.firebase.firestore().collection(this.collection).doc(this.documentId);
    }

    child(path) {
      const childSegments = String(path).split('/').filter(Boolean);
      return new RoomReference([...this.segments, ...childSegments]);
    }

    push() {
      const randomPart = Math.random().toString(36).slice(2, 12);
      return this.child(`${Date.now().toString(36)}-${randomPart}`);
    }

    async once(event) {
      if (event !== 'value') throw new Error(`Unsupported Firestore room event: ${event}`);
      const snapshot = await this.documentReference().get();
      const data = snapshot.exists ? snapshot.data() : null;
      return new RoomSnapshot(readPath(data, this.fieldPath), this);
    }

    on(event, callback, onError) {
      const documentReference = this.documentReference();
      const seenChildren = new Set();
      const subscription = {
        path: this.segments.join('/'),
        event,
        callback,
        unsubscribe: null,
      };

      if (event === 'value') {
        subscription.unsubscribe = documentReference.onSnapshot((snapshot) => {
          const data = snapshot.exists ? snapshot.data() : null;
          callback(new RoomSnapshot(readPath(data, this.fieldPath), this));
        }, onError);
      } else if (event === 'child_added') {
        subscription.unsubscribe = documentReference.onSnapshot((snapshot) => {
          const data = snapshot.exists ? snapshot.data() : null;
          const children = readPath(data, this.fieldPath);
          if (!children || typeof children !== 'object') return;
          if (this.fieldPath[this.fieldPath.length - 1] === 'actions') {
            Object.entries(children).forEach(([playerId, playerActions]) => {
              if (!playerActions || typeof playerActions !== 'object') return;
              Object.entries(playerActions).forEach(([actionId, action]) => {
                const key = `${playerId}/${actionId}`;
                if (seenChildren.has(key)) return;
                seenChildren.add(key);
                callback(new RoomSnapshot(action, this.child(key)));
              });
            });
            return;
          }
          Object.entries(children).forEach(([key, value]) => {
            if (seenChildren.has(key)) return;
            seenChildren.add(key);
            callback(new RoomSnapshot(value, this.child(key)));
          });
        }, onError);
      } else {
        throw new Error(`Unsupported Firestore room event: ${event}`);
      }

      subscriptions.push(subscription);
      return callback;
    }

    off(event, callback) {
      for (let index = subscriptions.length - 1; index >= 0; index -= 1) {
        const subscription = subscriptions[index];
        if (subscription.path !== this.segments.join('/') ||
            (event && subscription.event !== event) ||
            (callback && subscription.callback !== callback)) continue;
        subscription.unsubscribe();
        subscriptions.splice(index, 1);
      }
    }

    async mutate(transform) {
      const documentReference = this.documentReference();
      let outcome = { committed: false, data: null };
      await window.firebase.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(documentReference);
        const documentData = snapshot.exists ? snapshot.data() : null;
        const currentValue = clone(readPath(documentData, this.fieldPath));
        const previousValue = clone(currentValue);
        const nextValue = transform(currentValue);
        if (nextValue === undefined || pathsEqual(nextValue, previousValue)) {
          outcome = { committed: false, data: documentData };
          return false;
        }

        const nextData = this.fieldPath.length
          ? writePath(clone(documentData), this.fieldPath, nextValue)
          : clone(nextValue);
        if (nextData == null) transaction.delete(documentReference);
        else transaction.set(documentReference, nextData);
        outcome = { committed: true, data: nextData };
        return true;
      });

      return {
        committed: outcome.committed,
        snapshot: new RoomSnapshot(readPath(outcome.data, this.fieldPath), this),
      };
    }

    set(value) {
      return this.mutate(() => value);
    }

    update(updates) {
      if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return Promise.reject(new TypeError('Firestore room updates must be an object.'));
      }
      return this.mutate((currentValue) => {
        let nextValue = currentValue && typeof currentValue === 'object'
          ? clone(currentValue)
          : {};
        Object.entries(updates).forEach(([path, value]) => {
          nextValue = writePath(nextValue, path.split('/').filter(Boolean), value);
        });
        return nextValue;
      }).then((result) => result.snapshot);
    }

    remove() {
      return this.mutate(() => null);
    }

    transaction(updateFunction) {
      return this.mutate(updateFunction);
    }
  }

  return {
    ref(path) {
      const segments = String(path).split('/').filter(Boolean);
      if (!segments.length) throw new Error('A Firestore room path is required.');
      return new RoomReference(segments);
    },
  };
})();
