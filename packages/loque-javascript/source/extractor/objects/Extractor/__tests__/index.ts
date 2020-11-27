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
    it('collection document - simple 1', () => {
        const extractor = new Extractor(
            'records.id:1',
            data,
        );
        const recordsOne = extractor.extract<Record>().data;

        expect(recordsOne.id).toEqual('1');
        expect(recordsOne.ownedBy).toEqual('A');
        expect(recordsOne.value).toEqual('one');
    });

    it('collection document - simple 2', () => {
        const extractor = new Extractor(
            'records.id:2',
            data,
        );
        const recordsTwo = extractor.extract<Record>().data;

        expect(recordsTwo.id).toEqual('2');
        expect(recordsTwo.ownedBy).toEqual('B');
        expect(recordsTwo.value).toEqual('two');
    });

    it('collection document - multiple and', () => {
        const extractor = new Extractor(
            'records.id:1 & id:2',
            data,
        );
        const records = extractor.extract<Record[]>().data;

        expect(records.length).toEqual(2);
        expect(records[0].id).toEqual('1');
        expect(records[1].id).toEqual('2');
    });
});
// #endregion module
