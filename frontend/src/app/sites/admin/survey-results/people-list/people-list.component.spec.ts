import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../../shared/auth/auth.service';
import { answersOf } from '../../../../shared/testing/answers-of';
import { PeopleListComponent, PersonRow } from './people-list.component';

describe('PeopleListComponent: a visitor among the people', () => {
  beforeEach(() => {
    // The dates in the anotoki account's order (AdminDates): an account that says none.
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { preferences: () => null } }] });
  });

  async function show(rows: PersonRow[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PeopleListComponent);
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says "Not signed in" under a visitor’s name, and nothing of a person’s but their name - the site keeps no address', async () => {
    const host = await show([
      { response: answersOf('r1', 'Zuzka', false), note: null },
      { response: answersOf('r2', 'Visitor 3', true), note: null },
    ]);
    const people = [...host.querySelectorAll('.person')];

    expect(people[0].querySelector('.name')?.textContent).toBe('Zuzka');
    expect(people[0].querySelector('.details')).toBeNull();
    expect(people[0].querySelector('.not-signed-in')).toBeNull();
    expect(people[1].querySelector('.name')?.textContent).toBe('Visitor 3');
    expect(people[1].querySelector('.details')?.textContent?.trim()).toBe('Not signed in');
  });

  it('takes a person without the mark (an answer from before visitors) for somebody signed in', async () => {
    const before = answersOf('r1', 'Zuzka', false);
    delete before.person.visitor;
    const host = await show([{ response: before, note: null }]);

    expect(host.querySelector('.details')).toBeNull();
    expect(host.querySelector('.not-signed-in')).toBeNull();
  });
});
