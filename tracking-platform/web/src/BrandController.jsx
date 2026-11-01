import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useEffectAsync } from './reactHelper';
import { sessionActions } from './store';
import { useBrandAttribute } from './common/util/brand';
import { BRAND_NAME } from './common/util/brandDefaults';

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
    document.title = title || BRAND_NAME;
  }, [title]);

  return null;
};

export default BrandController;
