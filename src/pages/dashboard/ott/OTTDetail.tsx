import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const OTTDetail: React.FC = () => {
  const { ott_id } = useParams<{ ott_id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (ott_id) navigate(`/dashboard/ott/${ott_id}/manage`, { replace: true });
    else navigate('/dashboard/ott/all', { replace: true });
  }, [ott_id, navigate]);

  return null;
};

export default OTTDetail;
