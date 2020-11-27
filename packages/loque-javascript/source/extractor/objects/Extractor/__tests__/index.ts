// #region imports
    // #region external
    import Extractor from '../';
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
    it.only('collection document', () => {
        const extractor = new Extractor(
            'records.id:1',
            data,
        );
        const recordsOne = extractor.extract<Record>();
        console.log('recordsOne', recordsOne);

    });
});
// #endregion module
