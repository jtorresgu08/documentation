import { useDispatch, useSelector } from 'react-redux';
import { useEffectAsync } from './reactHelper';
import { sessionActions } from './store';

// loads the modules of the user's plan (inherited from its managers) to hide what the plan does not include
const ModulesController = () => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.session.user);

  useEffectAsync(async () => {
    if (user?.id) {
      const response = await fetch('/api/plans/modules');
      dispatch(sessionActions.updateModules(response.ok ? await response.json() : null));
    } else {
      dispatch(sessionActions.updateModules(null));
    }
  }, [user?.id, user?.attributes?.plan, user?.attributes?.modules]);

  return null;
};

export default ModulesController;
