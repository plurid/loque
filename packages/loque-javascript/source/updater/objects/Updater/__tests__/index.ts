// #region imports
    // #region external
    import Updater from '../';
    // #endregion external
// #endregion imports



// #region module
export interface Record {
    ownedBy: string;
    id: string;
    value: string;
}

export interface Data {
    records: Record[];
}

const data: Data = {
    records: [
        {
            ownedBy: 'A',
            id: '1',
            value: 'one',
        },
        {
            ownedBy: 'B',
            id: '2',
            value: 'two',
        },
        {
            ownedBy: 'A',
            id: '3',
            value: 'three',
        },
        {
            ownedBy: 'A',
            id: '4',
            value: 'four',
        },
    ],
};


describe('Extractor', () => {
    it('collection document - simple 1', () => {
        const extractor = new Updater(
            'records.id:1',
            data,
            {
                value: 'one-modified',
            },
        );
        const updatedData = extractor.result();

        const recordsOne = updatedData.records[0];

        expect(recordsOne.id).toEqual('1');
        expect(recordsOne.ownedBy).toEqual('A');
        expect(recordsOne.value).toEqual('one-modified');
    });
});
// #endregion module
