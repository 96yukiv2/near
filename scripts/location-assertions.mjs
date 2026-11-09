import assert from "node:assert/strict";

export async function checkLocationPermissions(
  users,
  anonymous,
  ids,
  deleteUser,
) {
  const [a, b, c] = users;
  async function call(user, action, params = {}) {
    return user.rpc("near_location_action", { action, ...params });
  }
  async function ok(user, action, params = {}) {
    const { data, error } = await call(user, action, params);
    assert.ifError(error);
    return data;
  }
  async function denied(user, action, params = {}) {
    assert.ok(
      (await call(user, action, params)).error,
      `${action} should be rejected`,
    );
  }
  async function friends(user, action, params = {}) {
    const { data, error } = await user.rpc("near_friend_action", {
      action,
      ...params,
    });
    assert.ifError(error);
    return data;
  }
  const dummy = { latitude: 35.66, longitude: 139.7, accuracy_m: 25 };
  const invite = await friends(a, "create_invite");
  await friends(b, "request", { token: invite.token });
  const pending = await friends(a, "list");
  const request = pending.incoming[0].id;
  assert.equal((await ok(a, "list")).sharing, false);
  await denied(anonymous, "list");
  await denied(a, "update", dummy);
  await denied(a, "start", { ...dummy, latitude: 91 });
  assert.ifError(
    (await a.from("profiles").update({ icon: "frog" }).eq("id", ids[0])).error,
  );
  assert.ok(
    (await a.from("profiles").update({ icon: "invalid" }).eq("id", ids[0]))
      .error,
  );
  const otherUpdate = await b
    .from("profiles")
    .update({ icon: "cat" })
    .eq("id", ids[0])
    .select();
  assert.ifError(otherUpdate.error);
  assert.equal(otherUpdate.data.length, 0);
  await ok(a, "start", dummy);
  assert.equal((await ok(a, "list")).locations.length, 1);
  assert.equal((await ok(b, "list")).locations.length, 0);
  await friends(a, "accept", { target: request });
  const visibleFriend = (await ok(b, "list")).locations[0];
  assert.equal(visibleFriend.id, ids[0]);
  assert.equal(visibleFriend.icon, "frog");
  const otherInvite = await friends(b, "create_invite");
  await friends(c, "request", { token: otherInvite.token });
  const pendingB = await friends(b, "list");
  await friends(b, "accept", { target: pendingB.incoming[0].id });
  assert.equal((await ok(c, "list")).locations.length, 0);
  await ok(c, "start", { ...dummy, latitude: 36 });
  assert.deepEqual(
    (await ok(a, "list")).locations.map((l) => l.id),
    [ids[0]],
  );
  assert.ok((await ok(b, "list")).locations.some((l) => l.id === ids[2]));
  await denied(b, "update", { ...dummy, user_id: ids[0] });
  await ok(a, "update", { ...dummy, latitude: 35 });
  assert.equal(
    (await ok(b, "list")).locations.find((l) => l.id === ids[0]).latitude,
    35,
  );
  const [stopResult] = await Promise.all([
    call(a, "stop"),
    call(a, "update", { ...dummy, latitude: 37 }),
  ]);
  assert.ifError(stopResult.error);
  assert.equal((await ok(a, "list")).sharing, false);
  assert.ok(!(await ok(b, "list")).locations.some((l) => l.id === ids[0]));
  await denied(a, "update", dummy);
  await ok(a, "start", dummy);
  await friends(a, "remove", { target: ids[1] });
  assert.ok(!(await ok(b, "list")).locations.some((l) => l.id === ids[0]));
  const next = await friends(a, "create_invite");
  await friends(b, "request", { token: next.token });
  const nextPending = await friends(a, "list");
  await friends(a, "accept", { target: nextPending.incoming[0].id });
  await ok(b, "start", { ...dummy, latitude: 34 });
  assert.ok((await ok(a, "list")).locations.some((l) => l.id === ids[1]));
  await friends(b, "block", { target: ids[0] });
  assert.ok(!(await ok(b, "list")).locations.some((l) => l.id === ids[0]));
  assert.ok(!(await ok(a, "list")).locations.some((l) => l.id === ids[1]));
  await friends(b, "unblock", { target: ids[0] });
  const again = await friends(a, "create_invite");
  await friends(b, "request", { token: again.token });
  const againPending = await friends(a, "list");
  await friends(a, "accept", { target: againPending.incoming[0].id });
  assert.ok((await ok(b, "list")).locations.some((l) => l.id === ids[0]));
  const deletedId = ids[0];
  await deleteUser(deletedId);
  assert.ok(!(await ok(b, "list")).locations.some((l) => l.id === deletedId));
}
