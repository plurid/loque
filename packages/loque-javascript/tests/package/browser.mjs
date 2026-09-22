import loque from '@plurid/loque';

export const selected = loque.extract('records.id:1', {
    records: [{ id: '1', value: 'one' }],
}).data;
