import { useCallback, useEffect, useState } from "react";
import { upsertMyPresence } from "../lib/cloudPresence";
import {
  readUserPresenceStatus,
  subscribeUserPresenceStatus,
  writeUserPresenceStatus,
  type UserPresenceStatus,
} from "../lib/userPresenceStatus";

export function useMyPresenceStatus(syncCloud = true) {
  const [status, setStatusState] = useState<UserPresenceStatus>(
    readUserPresenceStatus,
  );

  useEffect(() => subscribeUserPresenceStatus(setStatusState), []);

  const setStatus = useCallback(
    (next: UserPresenceStatus) => {
      writeUserPresenceStatus(next);
      if (syncCloud) {
        void upsertMyPresence(undefined, next);
      }
    },
    [syncCloud],
  );

  return { status, setStatus };
}
