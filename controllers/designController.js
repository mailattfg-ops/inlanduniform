const supabase = require('../config/supabase');

exports.listDesigns = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('designs')
            .select(`
                *,
                main_fabric:fabrics!main_fabric_id(name),
                attachment_fabric1:fabrics!attachment_fabric1_id(name),
                attachment_fabric2:fabrics!attachment_fabric2_id(name),
                buttons(name),
                threads(name)
            `)
            .order('design_code', { ascending: true });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createDesign = async (req, res) => {
    try {
        const { 
            design_code, 
            main_fabric_id, 
            attachment_fabric1_id, 
            attachment_fabric2_id, 
            button_id, 
            thread_id 
        } = req.body;

        const { data, error } = await supabase
            .from('designs')
            .insert([{
                design_code,
                main_fabric_id: main_fabric_id || null,
                attachment_fabric1_id: attachment_fabric1_id || null,
                attachment_fabric2_id: attachment_fabric2_id || null,
                button_id: button_id || null,
                thread_id: thread_id || null
            }])
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateDesign = async (req, res) => {
    const { id } = req.params;
    try {
        const { 
            design_code, 
            main_fabric_id, 
            attachment_fabric1_id, 
            attachment_fabric2_id, 
            button_id, 
            thread_id 
        } = req.body;

        const { data, error } = await supabase
            .from('designs')
            .update({
                design_code,
                main_fabric_id: main_fabric_id || null,
                attachment_fabric1_id: attachment_fabric1_id || null,
                attachment_fabric2_id: attachment_fabric2_id || null,
                button_id: button_id || null,
                thread_id: thread_id || null
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteDesign = async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('designs')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
