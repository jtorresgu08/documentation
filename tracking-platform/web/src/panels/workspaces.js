import fetchOrThrow from '../common/util/fetchOrThrow';
import { sessionActions } from '../store';

// Workspaces: named sets of open floating panels with their position and size ("night shift", "dispatch"…), kept in
// the user's attributes so they follow the user to any computer; one can be restored automatically after login
const KEY = 'workspaces';
const DEFAULT_KEY = 'workspaceDefault';

export const parseWorkspaces = (user) => {
  try {
    const items = JSON.parse(user?.attributes?.[KEY] || '[]');
    return { items: Array.isArray(items) ? items : [], defaultName: user?.attributes?.[DEFAULT_KEY] || null };
  } catch {
    return { items: [], defaultName: null };
  }
};

export const saveWorkspaces = async (dispatch, user, items, defaultName) => {
  const attributes = { ...user.attributes, [KEY]: JSON.stringify(items) };
  if (defaultName && items.some((item) => item.name === defaultName)) {
    attributes[DEFAULT_KEY] = defaultName;
  } else {
    delete attributes[DEFAULT_KEY];
  }
  const response = await fetchOrThrow(`/api/users/${user.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...user, attributes }),
  });
  dispatch(sessionActions.updateUser(await response.json()));
};
