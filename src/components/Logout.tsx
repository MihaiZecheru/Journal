import { useEffect } from "react";
import supabase from "../database/config/supabase";
import { useNavigate } from "react-router-dom";

const Logout = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    (async () => {
      try {
        await supabase.auth.signOut();
      } catch (error) {};
      navigate('/login');
    })();
  }, [navigate]);

  return (
    <div>Logging out...</div>
  );
}
 
export default Logout;