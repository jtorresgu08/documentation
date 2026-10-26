import { useMemo } from 'react';
import { useSelector } from 'react-redux';

// Server object with the white label attributes of the user's manager chain applied on top
export const useBrandedServer = () => {
  const server = useSelector((state) => state.session.server);
  const brand = useSelector((state) => state.session.brand);
  return useMemo(() => (server ? {
    ...server,
    attributes: { ...server.attributes, ...brand },
  } : server), [server, brand]);
};

export const useBrandAttribute = (key) => useBrandedServer()?.attributes?.[key];
