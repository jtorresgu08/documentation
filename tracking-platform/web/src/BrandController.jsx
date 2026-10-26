import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEffectAsync } from './reactHelper';
import { sessionActions } from './store';
import { useBrandAttribute } from './common/util/brand';

const BrandController = () => {
  const dispatch = useDispatch();
  const userId = useSelector((state) => state.session.user?.id);
  const title = useBrandAttribute('title');

  useEffectAsync(async () => {
    const response = await fetch(`/api/hierarchy/brand?host=${encodeURIComponent(window.location.hostname)}`);
    if (response.ok) {
      dispatch(sessionActions.updateBrand(await response.json()));
    }
  }, [userId]);

  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  return null;
};

export default BrandController;
