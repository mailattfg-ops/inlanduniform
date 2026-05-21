require('dotenv').config();
const supabase = require('../config/supabase');

async function seed() {
    console.log('==================================================');
    console.log('  Art Number Hub - Automated Database Seeder       ');
    console.log('==================================================\n');

    try {
        // 1. Seed Dresses
        const dresses = [
            { code: '4J', name: 'Cotton Shirt' },
            { code: '6B', name: 'Trousers' },
            { code: '5K', name: 'Blazer' },
            { code: '7M', name: 'Skirt' }
        ];
        console.log('Seeding Dresses...');
        for (const dress of dresses) {
            const { data, error } = await supabase
                .from('art_dresses')
                .upsert([dress], { onConflict: 'code' })
                .select();
            if (error) console.error(`  Error seeding dress ${dress.code}:`, error.message);
            else console.log(`  Seeded: [${dress.code}] ${dress.name}`);
        }

        // 2. Seed Genders
        const genders = [
            { code: '1', name: 'Male' },
            { code: '2', name: 'Female' },
            { code: '3', name: 'Unisex' }
        ];
        console.log('\nSeeding Genders...');
        for (const gender of genders) {
            const { data, error } = await supabase
                .from('art_genders')
                .upsert([gender], { onConflict: 'code' })
                .select();
            if (error) console.error(`  Error seeding gender ${gender.code}:`, error.message);
            else console.log(`  Seeded: [${gender.code}] ${gender.name}`);
        }

        // 3. Seed Patterns
        const patterns = [
            { code: '012', name: 'Striped' },
            { code: '045', name: 'Checkered' },
            { code: '100', name: 'Solid Color' }
        ];
        console.log('\nSeeding Patterns...');
        for (const pattern of patterns) {
            const { data, error } = await supabase
                .from('art_patterns')
                .upsert([pattern], { onConflict: 'code' })
                .select();
            if (error) console.error(`  Error seeding pattern ${pattern.code}:`, error.message);
            else console.log(`  Seeded: [${pattern.code}] ${pattern.name}`);
        }

        // 4. Seed Combined Art Number (4J-1012)
        console.log('\nGenerating pre-registered combination "4J-1012"...');
        const [dRes, gRes, pRes] = await Promise.all([
            supabase.from('art_dresses').select('id').eq('code', '4J').single(),
            supabase.from('art_genders').select('id').eq('code', '1').single(),
            supabase.from('art_patterns').select('id').eq('code', '012').single()
        ]);

        if (dRes.data && gRes.data && pRes.data) {
            const { error: comboError } = await supabase
                .from('art_numbers')
                .upsert([{
                    dress_id: dRes.data.id,
                    gender_id: gRes.data.id,
                    pattern_id: pRes.data.id,
                    code: '4J-1012'
                }], { onConflict: 'code' });

            if (comboError) {
                console.error('  Error seeding combined code 4J-1012:', comboError.message);
            } else {
                console.log('  Seeded Combination: "4J-1012" successfully registered!');
            }
        } else {
            console.error('  Failed to retrieve ids of seeded components to generate the combined code.');
        }

        console.log('\n🎉 Seeding complete! Everything is ready for operations.');
    } catch (err) {
        console.error('Migration seeding encountered an unexpected error:', err.message);
    }
    console.log('\n==================================================');
}

seed();
